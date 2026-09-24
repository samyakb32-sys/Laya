"""Route a request with the classifier, hand it to the matching sub-agent, fall back if unsure."""

from __future__ import annotations

import re
import time
from dataclasses import asdict, dataclass, field

from .agents import Agent, load_agents
from .backends import ChatBackend
from .classifier import Decision, make_classifier
from .config import Config

UNSURE = re.compile(
    r"\b(i'?m not sure|i am not sure|i don'?t know|i cannot (answer|help|solve)|"
    r"i can'?t (answer|help|solve)|beyond my (ability|capabilit\w+)|too complex for me)\b",
    re.I,
)


@dataclass
class Result:
    reply: str
    agent: str                     # agent that actually produced the reply
    routed_agent: str              # agent chosen before any fallback
    decision: Decision | None      # None when the agent was forced
    fell_back: bool = False
    route_ms: float = 0.0
    total_ms: float = 0.0
    reply_ms: float = 0.0
    usage: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class Pipeline:
    def __init__(self, cfg: Config, agents: dict[str, Agent] | None = None,
                 classifier=None, backend: ChatBackend | None = None):
        self.cfg = cfg
        self.agents = agents or load_agents(cfg.agents_file)
        if cfg.fallback_agent not in self.agents:
            raise ValueError(f"fallback_agent {cfg.fallback_agent!r} is not in {cfg.agents_file}")
        self.classifier = classifier or make_classifier(cfg, self.agents)
        self.backend = backend or ChatBackend(cfg.backend)

    def route(self, messages: list[dict]) -> tuple[str, Decision]:
        d = self.classifier.classify(messages)
        agent = d.agent if d.agent in self.agents else self.cfg.fallback_agent
        if d.confidence < self.cfg.min_confidence:
            agent = self.cfg.fallback_agent
        return agent, d

    def run(self, messages: list[dict], force_agent: str | None = None) -> Result:
        t0 = time.perf_counter()
        if force_agent:
            if force_agent not in self.agents:
                raise ValueError(f"unknown agent {force_agent!r}; have {sorted(self.agents)}")
            agent_name, decision = force_agent, None
        else:
            agent_name, decision = self.route(messages)
        route_ms = (time.perf_counter() - t0) * 1000

        t1 = time.perf_counter()
        reply, usage = self.backend.chat(self.agents[agent_name].build_messages(messages))
        reply_ms = (time.perf_counter() - t1) * 1000

        fell_back = False
        if (self.cfg.escalate_on_unsure_reply and agent_name != self.cfg.fallback_agent
                and (not reply or UNSURE.search(reply[:400]))):
            fb = self.agents[self.cfg.fallback_agent]
            reply, usage = self.backend.chat(fb.build_messages(messages))
            agent_name, fell_back = self.cfg.fallback_agent, True

        return Result(reply, agent_name, agent_name if force_agent else decision.agent,
                      decision, fell_back, route_ms, (time.perf_counter() - t0) * 1000, reply_ms, usage)
