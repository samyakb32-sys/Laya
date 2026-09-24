"""Measure the router: how often does it pick the right sub-agent, and how fast is a reply?

Prompts file: JSON Lines, one {"prompt": "...", "agent": "<agent name>"} per line
("agent" is your expected label and is optional).
"""

from __future__ import annotations

import json
import statistics
from collections import Counter
from pathlib import Path

from .pipeline import Pipeline


def load_prompts(path: str) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def run_bench(pipeline: Pipeline, prompts: list[dict], route_only: bool = False) -> dict:
    rows = []
    for i, p in enumerate(prompts, 1):
        msgs = [{"role": "user", "content": p["prompt"]}]
        agent, d = pipeline.route(msgs)
        row = {"prompt": p["prompt"], "label": p.get("agent"), "predicted": d.agent,
               "conf": d.confidence, "agent": agent, "route_ms": d.latency_ms}
        if not route_only:
            r = pipeline.run(msgs)
            row |= {"final_agent": r.agent, "fell_back": r.fell_back, "reply_ms": r.reply_ms}
        rows.append(row)
        print(f"[{i}/{len(prompts)}] {row['label'] or '?':10} -> {agent:10} ({d.agent} @ {d.confidence:.2f})  {p['prompt'][:55]}")

    report: dict = {"n": len(rows), "agents": dict(Counter(r["agent"] for r in rows))}
    labelled = [r for r in rows if r["label"]]
    if labelled:
        report["classifier_accuracy"] = sum(r["predicted"] == r["label"] for r in labelled) / len(labelled)
        report["routed_accuracy"] = sum(r["agent"] == r["label"] for r in labelled) / len(labelled)
    report["route_ms_mean"] = statistics.mean(r["route_ms"] for r in rows)
    if not route_only:
        report["reply_ms_mean"] = statistics.mean(r["reply_ms"] for r in rows)
        report["fallbacks"] = sum(r["fell_back"] for r in rows)

    print("\n=== report ===")
    for k, v in report.items():
        print(f"{k:18}: {v:.3f}" if isinstance(v, float) else f"{k:18}: {v}")
    return {"report": report, "rows": rows}
