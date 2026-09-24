"""Difficulty/topic classifiers. Each maps a chat request to one agent name.

`LayaClassifier` runs Laya in-process, `LayaHTTPClassifier` calls a running
`laya-serve`, and `HeuristicClassifier` is a keyword fallback that needs no
model (useful for trying the pipeline before downloading Laya, and for tests).
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

import httpx

from .agents import Agent
from .config import Config


@dataclass
class Decision:
    agent: str
    confidence: float
    source: str
    latency_ms: float
    probabilities: dict[str, float] = field(default_factory=dict)


def request_text(messages: list[dict]) -> str:
    """The text of the latest user message (handles OpenAI content-part lists)."""
    for m in reversed(messages):
        if m.get("role") != "user":
            continue
        content = m.get("content") or ""
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if p.get("type") == "text")
        return content.strip()
    return ""


def build_questions(agents: dict[str, Agent]) -> dict:
    return {
        "task": {
            "type": "choice",
            "instructions": "Which kind of task is this request? Pick the closest match.",
            "criteria": {name: a.criteria for name, a in agents.items()},
        }
    }


def _from_laya_result(result: dict, source: str, t0: float) -> Decision:
    ans = result["answers"]["task"]
    return Decision(
        agent=ans["choice"],
        confidence=float(ans["confidence"]),
        probabilities=ans.get("probabilities", {}),
        source=source,
        latency_ms=(time.perf_counter() - t0) * 1000,
    )


class LayaClassifier:
    def __init__(self, agents: dict[str, Agent], device: str | None = None):
        from laya import Router  # heavy import (torch); only when this classifier is used

        self.questions = build_questions(agents)
        self.router = Router(preload=True, device=device)

    def classify(self, messages: list[dict]) -> Decision:
        t0 = time.perf_counter()
        result = self.router.predict({"request": request_text(messages)}, self.questions)
        return _from_laya_result(result, "laya", t0)


class LayaHTTPClassifier:
    def __init__(self, agents: dict[str, Agent], url: str, client: httpx.Client | None = None):
        self.questions = build_questions(agents)
        self.url = url.rstrip("/") + "/v1/systemone"
        self.client = client or httpx.Client(timeout=30)

    def classify(self, messages: list[dict]) -> Decision:
        t0 = time.perf_counter()
        resp = self.client.post(
            self.url, json={"state": {"request": request_text(messages)}, "questions": self.questions}
        )
        resp.raise_for_status()
        return _from_laya_result(resp.json(), "laya-http", t0)


class HeuristicClassifier:
    """Keyword rules using each agent's `keywords` list from agents.yaml. Crude, but free and
    instant — a way to try the pipeline, or run tests, without downloading Laya or any LLM."""

    def __init__(self, agents: dict[str, Agent], fallback: str = "general"):
        self.agents = agents
        self.fallback = fallback
        self._patterns = {name: self._pattern(a.keywords) for name, a in agents.items()
                           if name != fallback and a.keywords}

    @staticmethod
    def _pattern(keywords: tuple[str, ...]) -> re.Pattern:
        return re.compile(r"\b(" + "|".join(re.escape(k) for k in keywords) + r")\b", re.I)

    def classify(self, messages: list[dict]) -> Decision:
        t0 = time.perf_counter()
        text = request_text(messages)
        hits = {name: len(p.findall(text)) for name, p in self._patterns.items()}
        best = max(hits, key=hits.get) if hits else self.fallback
        agent, conf = (best, 0.7) if hits.get(best, 0) > 0 else (self.fallback, 0.6)
        return Decision(agent, conf, "heuristic", (time.perf_counter() - t0) * 1000)


def make_classifier(cfg: Config, agents: dict[str, Agent]):
    if cfg.classifier == "laya":
        return LayaClassifier(agents, device=cfg.laya_device)
    if cfg.classifier == "laya-http":
        return LayaHTTPClassifier(agents, cfg.laya_url)
    if cfg.classifier == "heuristic":
        return HeuristicClassifier(agents, fallback=cfg.fallback_agent)
    raise ValueError(f"unknown classifier {cfg.classifier!r}; use laya, laya-http or heuristic")
