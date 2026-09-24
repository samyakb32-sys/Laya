"""Configuration: the classifier to use, one shared backend model, and the fallback agent."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Backend:
    """One OpenAI-compatible chat endpoint (Ollama, llama.cpp server, LM Studio...)."""

    base_url: str
    model: str
    api_key: str = "none"
    max_tokens: int = 1024
    timeout_s: float = 300.0
    extra_body: dict = field(default_factory=dict)


@dataclass
class Config:
    # "laya" (in-process), "laya-http" (a running `laya-serve`), or "heuristic" (no model).
    classifier: str = "laya"
    laya_url: str = "http://localhost:8000"
    laya_device: str | None = None  # laya's own encoder is small enough to run fine on CPU
    # Below this Laya confidence, use the fallback agent instead of guessing.
    min_confidence: float = 0.5
    # Name of the agent in agents.yaml used for low-confidence and "unsure" replies.
    fallback_agent: str = "general"
    escalate_on_unsure_reply: bool = True
    agents_file: str = "agents.yaml"
    backend: Backend = field(default_factory=lambda: Backend(base_url="http://localhost:11434/v1", model="llama3.2:3b"))


def load_config(path: str | os.PathLike | None = None) -> Config:
    path = path or os.environ.get("LAYA_AGENTS_CONFIG", "config.yaml")
    raw = yaml.safe_load(Path(path).read_text()) or {}
    backend = Backend(**raw.pop("backend"))
    return Config(**raw, backend=backend)
