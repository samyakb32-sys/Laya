"""Command line: python -m laya_agents {list,route,ask,serve,bench} ..."""

from __future__ import annotations

import argparse
import json

from .agents import load_agents
from .bench import load_prompts, run_bench
from .config import load_config
from .pipeline import Pipeline


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="laya_agents")
    ap.add_argument("-c", "--config", help="config file (default: $LAYA_AGENTS_CONFIG or config.yaml)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="list configured sub-agents")

    route = sub.add_parser("route", help="only show which agent a message would go to")
    route.add_argument("text")

    ask = sub.add_parser("ask", help="route and answer one message")
    ask.add_argument("text")
    ask.add_argument("--agent", help="skip routing and force an agent by name")

    serve = sub.add_parser("serve", help="run the OpenAI-compatible server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)

    bench = sub.add_parser("bench", help="check routing accuracy and reply latency")
    bench.add_argument("prompts", help="JSON Lines file of {prompt, agent}")
    bench.add_argument("--route-only", action="store_true", help="only check routing, no LLM calls")
    bench.add_argument("--out", help="write per-prompt results as JSON")

    args = ap.parse_args(argv)

    if args.cmd == "list":
        for name, a in load_agents().items():
            print(f"{name:10} {a.criteria}")
        return

    cfg = load_config(args.config)
    if args.cmd == "route":
        # Routing needs no LLM backend, so this works before Ollama (or similar) is running.
        agent, d = Pipeline(cfg).route([{"role": "user", "content": args.text}])
        print(json.dumps({"agent": agent, "decision": d.__dict__}, indent=2))
    elif args.cmd == "ask":
        r = Pipeline(cfg).run([{"role": "user", "content": args.text}], force_agent=args.agent)
        print(r.reply)
        conf = f", {r.decision.source} confidence {r.decision.confidence:.2f}" if r.decision else ""
        fb = " -> fell back to general" if r.fell_back else ""
        print(f"\n[agent {r.agent}{fb} | route {r.route_ms:.0f} ms{conf} | reply {r.reply_ms / 1000:.1f}s | total {r.total_ms / 1000:.1f}s]")
    elif args.cmd == "serve":
        import uvicorn

        from .server import create_app

        uvicorn.run(create_app(Pipeline(cfg)), host=args.host, port=args.port)
    elif args.cmd == "bench":
        out = run_bench(Pipeline(cfg), load_prompts(args.prompts), args.route_only)
        if args.out:
            with open(args.out, "w") as f:
                json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
