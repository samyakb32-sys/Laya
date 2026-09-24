"""Sub-agents: same base model, one system prompt per task. No fine-tuning, no GPU."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Agent:
    name: str
    criteria: str               # shown to Laya as the description of this choice
    system_prompt: str
    keywords: tuple[str, ...] = ()  # only used by the heuristic (no-model) classifier

    def build_messages(self, messages: list[dict]) -> list[dict]:
        return [{"role": "system", "content": self.system_prompt.strip()}, *messages]


def load_agents(path: str | os.PathLike | None = None) -> dict[str, Agent]:
    path = path or os.environ.get("LAYA_AGENTS_FILE", "agents.yaml")
    raw = yaml.safe_load(Path(path).read_text()) or {}
    entries = raw.get("agents") or []
    if not entries:
        raise ValueError(f"{path}: no agents defined under 'agents:'")
    agents = {e["name"]: Agent(e["name"], e["criteria"], e["system_prompt"], tuple(e.get("keywords", ())))
              for e in entries}
    if len(agents) != len(entries):
        raise ValueError(f"{path}: duplicate agent name")
    if len(agents) > 15:
        print(f"warning: {len(agents)} agents defined; Laya's own accuracy drops with many "
              f"choices (see its model card) — consider grouping into fewer, or a two-step router")
    return agents
