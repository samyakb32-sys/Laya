# Laya — task sub-agents, no GPU required

One small model, many system prompts. [Laya](https://huggingface.co/convaiinnovations/laya)
(a ~400M model that makes a decision in well under a second on CPU) reads each request and
picks which **sub-agent** should answer it — email, code, math, translation, and more, all
defined in [`agents.yaml`](agents.yaml). Every sub-agent is the *same* small base model with a
different system prompt, so there's nothing to fine-tune and no GPU is needed:

```
request ──► Laya: which task is this?
              ├─ email      ──► same small model, "you write emails" prompt
              ├─ code       ──► same small model, "you write code" prompt
              ├─ math       ──► same small model, "you are a math tutor" prompt
              ├─ ... (translate, summarize, writing, resume, study, planning, recipe)
              └─ general    ──► fallback for anything else, or if Laya is unsure
Laya's confidence < min_confidence ──► general
sub-agent replies "I'm not sure…"  ──► retried once with general
```

Why sub-agents instead of one prompt for everything: a short, focused system prompt
("you write emails, keep it professional") gets a small 1–4B model to behave far more
consistently on that task than one long prompt trying to cover every case at once.

## Setup

```bash
pip install -r requirements.txt      # includes laya (torch + transformers); CPU-only is fine
cp config.example.yaml config.yaml
ollama pull llama3.2:3b              # or any small model — no GPU needed
```

To try the pipeline before downloading Laya (~2 GB on first run), set `classifier: heuristic`
in `config.yaml` — a free keyword classifier using each agent's `keywords` list.

## Use

```bash
python -m laya_agents list                          # the configured sub-agents

python -m laya_agents route "fix this python bug"    # which agent? (no LLM call)
python -m laya_agents ask "plan a 3-day Goa trip"     # route and answer
python -m laya_agents ask "hi" --agent code           # force a specific agent

python -m laya_agents serve                           # OpenAI-compatible server on :8080
curl -s localhost:8080/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "write me an email"}]}'
```

`model: "auto"` routes with Laya; the name of any agent (`"code"`, `"email"`, ...) forces it.
Each response has a `routing` field with Laya's decision and confidence. Streaming isn't
supported yet.

## Add a task

Add one entry to `agents.yaml` — no retraining, no new model:

```yaml
  - name: legal
    criteria: "reviewing or explaining contracts, terms of service, or legal documents in plain language"
    keywords: [contract, clause, terms of service, agreement, liability]   # heuristic classifier only
    system_prompt: |
      You explain legal text in plain language. Flag anything unusual or one-sided.
      You are not a lawyer and you say so once, briefly, if asked for legal advice.
```

Keep the total under ~15 agents — Laya's own accuracy drops as the option list grows (see
its model card). Past that, group agents into categories and route in two steps.

## Measure it on your own requests

`prompts/sample.jsonl` has 30 labelled requests across all 11 agents. Replace it with your own
requests in the same format — the router only helps if it's right on what you actually send.

```bash
python -m laya_agents bench prompts/sample.jsonl --route-only   # accuracy only, no LLM calls
python -m laya_agents bench prompts/sample.jsonl --out results.json
```

The report shows `classifier_accuracy` (how often Laya matches your label) and, for a full
run, `reply_ms_mean` and how many requests `fell_back` to the general agent. With the
heuristic classifier and its curated keyword lists, the sample set scores about 87% accuracy —
a floor to compare Laya's real accuracy against once you have it installed.

## Laya's limits (from its model card)

- **The base checkpoint is not a reliable zero-shot decider out of the box.** Its typed-decisions
  benchmark shows the un-fine-tuned checkpoint close to chance. Run `bench --route-only` on your
  own labelled requests first. If accuracy is low, either reword `criteria` in `agents.yaml` to
  better match your requests (cheapest fix), or fine-tune Laya with its
  [notebook](https://github.com/NandhaKishorM/laya/blob/main/notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb).
- **It ships over-confident**; consider fitting a temperature on your own data before trusting
  raw `confidence` values, and keep `min_confidence` conservative until you do.
- This router asks one `choice` question (Laya's most reliable primitive per its README).
- Laya's `Router` switches to its multilingual checkpoint automatically for non-Latin scripts.

## Layout

```
agents.yaml           the sub-agents: name, criteria (for Laya), keywords (heuristic only), system_prompt
laya_agents/
  agents.py           Agent + load_agents()
  classifier.py       Laya (in-process or laya-serve over HTTP) + keyword fallback
  pipeline.py         route -> call agent -> fall back to general on low confidence / unsure reply
  backends.py         OpenAI-compatible chat client (strips <think> blocks)
  server.py           OpenAI-compatible /v1/chat/completions server
  bench.py            routing accuracy + reply latency
config.example.yaml
prompts/sample.jsonl
tests/                pytest, no GPU or network needed
```

Run the tests with `pip install pytest && python -m pytest tests`.
