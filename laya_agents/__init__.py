"""Route each chat request with Laya to a small sub-agent built for that task.

Every agent is the same small base model with a different system prompt, so
there is nothing to fine-tune and no GPU is required.
"""

from .agents import Agent, load_agents
from .config import Config, load_config
from .pipeline import Pipeline, Result

__all__ = ["Agent", "Config", "Pipeline", "Result", "load_agents", "load_config"]
