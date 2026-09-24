import json

import httpx
import pytest
from fastapi.testclient import TestClient

from laya_agents.agents import Agent, load_agents
from laya_agents.backends import ChatBackend
from laya_agents.bench import run_bench
from laya_agents.classifier import Decision, HeuristicClassifier, LayaHTTPClassifier, request_text
from laya_agents.config import Backend, Config, load_config
from laya_agents.pipeline import Pipeline
from laya_agents.server import create_app

AGENTS = {
    "email": Agent("email", "writing or replying to an email", "You write emails.", ("email",)),
    "code": Agent("code", "writing or debugging code", "You write code.", ("debug", "code")),
    "general": Agent("general", "anything else, casual chat", "You are a general assistant."),
}


class FakeClassifier:
    def __init__(self, agent, confidence=0.9):
        self.decision = Decision(agent, confidence, "fake", 1.0)

    def classify(self, messages):
        return self.decision


class FakeBackend:
    def __init__(self, replies=None):
        self.cfg = Backend(base_url="http://x", model="fake")
        self.replies = replies or {}
        self.calls = []

    def chat(self, messages):
        self.calls.append(messages)
        system = messages[0]["content"]
        reply = next((r for prefix, r in self.replies.items() if system.startswith(prefix)), "ok")
        return reply, {"total_tokens": 3}


def make(agent, confidence=0.9, replies=None, agents=AGENTS, **cfg):
    backend = FakeBackend({agents[k].system_prompt: v for k, v in (replies or {}).items()})
    return Pipeline(Config(**cfg), agents, FakeClassifier(agent, confidence), backend), backend


MSG = [{"role": "user", "content": "hello"}]


@pytest.mark.parametrize("agent", ["email", "code", "general"])
def test_routes_to_classified_agent(agent):
    p, b = make(agent)
    r = p.run(MSG)
    assert r.agent == r.routed_agent == agent and not r.fell_back
    assert len(b.calls) == 1
    assert b.calls[0][0]["content"] == AGENTS[agent].system_prompt
    assert b.calls[0][1:] == MSG


def test_low_confidence_falls_back_to_general():
    p, _ = make("email", confidence=0.3, min_confidence=0.5)
    r = p.run(MSG)
    assert r.agent == "general" and r.routed_agent == "email"


def test_unsure_reply_falls_back_to_general():
    p, b = make("code", replies={"code": "I'm not sure about that."})
    r = p.run(MSG)
    assert r.agent == "general" and r.routed_agent == "code" and r.fell_back
    assert len(b.calls) == 2


def test_fallback_agent_itself_never_loops_on_unsure():
    p, b = make("general", replies={"general": "I don't know"})
    r = p.run(MSG)
    assert r.agent == "general" and not r.fell_back and len(b.calls) == 1


def test_escalation_can_be_disabled():
    p, _ = make("code", replies={"code": "I don't know"}, escalate_on_unsure_reply=False)
    r = p.run(MSG)
    assert r.agent == "code" and not r.fell_back


def test_unknown_classifier_output_falls_back_to_general():
    p, _ = make("not_a_real_agent")
    assert p.run(MSG).agent == "general"


def test_forced_agent_skips_classifier():
    p, _ = make("email")
    r = p.run(MSG, force_agent="code")
    assert r.agent == "code" and r.decision is None


def test_forced_unknown_agent_raises():
    p, _ = make("email")
    with pytest.raises(ValueError, match="unknown agent"):
        p.run(MSG, force_agent="nope")


def test_fallback_agent_must_exist():
    with pytest.raises(ValueError, match="fallback_agent"):
        Pipeline(Config(fallback_agent="nope"), AGENTS, FakeClassifier("email"), FakeBackend())


def test_request_text_uses_latest_user_message_and_content_parts():
    msgs = [
        {"role": "user", "content": "old"},
        {"role": "assistant", "content": "x"},
        {"role": "user", "content": [{"type": "text", "text": "new"}, {"type": "image_url"}]},
    ]
    assert request_text(msgs) == "new"


@pytest.mark.parametrize("text,agent", [
    ("write an email to my landlord", "email"),
    ("debug this code please", "code"),
    ("hi there", "general"),
])
def test_heuristic_classifier(text, agent):
    assert HeuristicClassifier(AGENTS).classify([{"role": "user", "content": text}]).agent == agent


def test_laya_http_classifier_parses_systemone_response():
    seen = {}

    def handler(req):
        seen["url"], seen["body"] = str(req.url), json.loads(req.content)
        return httpx.Response(200, json={"answers": {"task": {
            "type": "choice", "choice": "code", "confidence": 0.77,
            "probabilities": {"email": 0.1, "code": 0.77, "general": 0.13}}}})

    c = LayaHTTPClassifier(AGENTS, "http://laya:8000/", httpx.Client(transport=httpx.MockTransport(handler)))
    d = c.classify([{"role": "user", "content": "fix this bug"}])
    assert (d.agent, d.confidence, d.source) == ("code", 0.77, "laya-http")
    assert seen["url"] == "http://laya:8000/v1/systemone"
    assert seen["body"]["state"] == {"request": "fix this bug"}
    assert seen["body"]["questions"]["task"]["criteria"]["code"] == AGENTS["code"].criteria


def test_chat_backend_sends_extra_body_and_strips_think():
    seen = {}

    def handler(req):
        seen["url"], seen["body"] = str(req.url), json.loads(req.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "<think>hmm</think>\n42"}}],
                                         "usage": {"total_tokens": 5}})

    cfg = Backend(base_url="http://llm/v1/", model="m", max_tokens=7,
                  extra_body={"chat_template_kwargs": {"enable_thinking": False}})
    text, usage = ChatBackend(cfg, httpx.Client(transport=httpx.MockTransport(handler))).chat(MSG)
    assert text == "42" and usage == {"total_tokens": 5}
    assert seen["url"] == "http://llm/v1/chat/completions"
    assert seen["body"]["model"] == "m" and seen["body"]["max_tokens"] == 7
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": False}


def test_server_openai_shape_and_forced_agent():
    p, _ = make("email")
    client = TestClient(create_app(p))
    r = client.post("/v1/chat/completions", json={"model": "auto", "messages": MSG}).json()
    assert r["choices"][0]["message"]["content"] == "ok"
    assert "(email)" in r["model"] and r["routing"]["agent"] == "email"
    r = client.post("/v1/chat/completions", json={"model": "code", "messages": MSG}).json()
    assert r["routing"]["agent"] == "code"
    assert client.post("/v1/chat/completions", json={"messages": MSG, "stream": True}).status_code == 400
    assert set(m["id"] for m in client.get("/v1/models").json()["data"]) == {"auto", *AGENTS}


def test_bench_reports_accuracy(capsys):
    p, _ = make("email")
    prompts = [{"prompt": "a", "agent": "email"}, {"prompt": "b", "agent": "code"}]
    rep = run_bench(p, prompts)["report"]
    assert rep["classifier_accuracy"] == 0.5
    assert "reply_ms_mean" in rep


def test_load_config(tmp_path):
    f = tmp_path / "c.yaml"
    f.write_text("classifier: heuristic\nbackend: {base_url: http://a/v1, model: s}\n")
    cfg = load_config(f)
    assert cfg.classifier == "heuristic" and cfg.backend.model == "s"


def test_load_agents(tmp_path):
    f = tmp_path / "a.yaml"
    f.write_text("agents:\n  - {name: a, criteria: c1, system_prompt: p1, keywords: [x, y]}\n"
                  "  - {name: b, criteria: c2, system_prompt: p2}\n")
    agents = load_agents(f)
    assert set(agents) == {"a", "b"} and agents["a"].criteria == "c1"
    assert agents["a"].keywords == ("x", "y") and agents["b"].keywords == ()

    f.write_text("agents: []\n")
    with pytest.raises(ValueError, match="no agents"):
        load_agents(f)
