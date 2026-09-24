"""OpenAI-compatible HTTP server, so any chat UI or SDK can use the router as one model.

model="auto" (or anything unknown) routes with Laya; model="<agent name>" forces that agent.
"""

from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .pipeline import Pipeline


class ChatRequest(BaseModel):
    model: str = "auto"
    messages: list[dict]
    stream: bool = False


def create_app(pipeline: Pipeline) -> FastAPI:
    app = FastAPI(title="laya-agents")

    @app.get("/v1/models")
    def models():
        ids = ["auto", *sorted(pipeline.agents)]
        return {"object": "list", "data": [{"id": i, "object": "model", "owned_by": "laya-agents"} for i in ids]}

    @app.post("/v1/route")
    def route(req: ChatRequest):
        agent, d = pipeline.route(req.messages)
        return {"agent": agent, "decision": d.__dict__}

    @app.post("/v1/chat/completions")
    def chat(req: ChatRequest):
        if req.stream:
            raise HTTPException(400, "streaming is not supported by this prototype; send stream=false")
        force = req.model if req.model in pipeline.agents else None
        r = pipeline.run(req.messages, force_agent=force)
        routing = r.to_dict()
        routing.pop("reply")
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": f"{pipeline.backend.cfg.model} ({r.agent})",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": r.reply}, "finish_reason": "stop"}],
            "usage": r.usage,
            "routing": routing,
        }

    return app
