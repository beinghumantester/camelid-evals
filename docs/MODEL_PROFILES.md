# Model profiles

`fixtures/model-profiles.json` declares what capabilities the currently
loaded Camelid model actually has, so the harness can gate which eval
cases are even attempted — a capability the active model doesn't have is
reported `BLOCKED`, never silently skipped or force-run against the wrong
model (`scripts/lib/profiles.ts`'s `blockedByProfile()`).

## Why this exists

Camelid can run any of several very different real GGUF files, and a case
that assumes tool-calling or embeddings support will simply be wrong
against a model that doesn't have it — not a Camelid defect, just a
mismatched test. `ModelProfile` (`scripts/lib/types.ts`) makes "what's
loaded" an explicit, checkable fact rather than an assumption baked into
each case.

## The five real profiles

All five are files the user actually has on disk in `models/` on the test
laptop (HP EliteBook 840 G6). None declare `vision: true` — none pair with
a resident Prism/Qwen3-VL projector, and this laptop has no Metal/CUDA
backend to run one on regardless.

| Profile id | Ledger row | Capabilities (chat / tools / embeddings / vision) |
|---|---|---|
| `tinyllama-1.1b-q8` (**active by default**) | `tinyllama_1_1b_chat_q8_0` | ✓ / ✗ / ✗ / ✗ |
| `llama32-3b-instruct-q8` | `llama32_3b_instruct_q8_0` | ✓ / ✓ / ✗ / ✗ |
| `nomic-embed-v1.5-q8` | `nomic_embed_text_v1_5_q8_0` | ✗ / ✗ / ✓ / ✗ |
| `qwen3-0.6b-instruct-q8` | `qwen3_0_6b_instruct_q8_0` | ✓ / ✗ / ✗ / ✗ |
| `gemma3-1b-it-q8` | `gemma_3_1b_it_q8_0` | ✓ / ✗ / ✗ / ✗ |

Every `tool_capable`/embeddings capability value here comes from the real
v0.6.1 ledger rows in `fixtures/ledger-excerpt.json`, not an assumption
about the model family — this is why `llama32-3b-instruct-q8` is the only
`tools: true` row despite Qwen3 and Gemma also being modern instruct
models: the ledger's real `tool_capable` field is what's authoritative,
not a guess based on the model's reputation.

## Selecting a profile

The active profile is `fixtures/model-profiles.json`'s `activeProfileId`
by default (`tinyllama-1.1b-q8`, matching what's actually loaded on the
test laptop day to day). Override per-run with:

```
CAMELID_MODEL_PROFILE=nomic-embed-v1.5-q8 npm run evals
```

`getActiveProfile()` throws (never silently falls back) if the override
names a profile id that doesn't exist in the fixture — the same
never-fabricate discipline as `scripts/lib/ledger.ts`'s `getRows()`.

## Adding a new profile

1. Confirm the model's real ledger row in `fixtures/ledger-excerpt.json`
   (or add it there first, citing the real `ledger/camelid-ledger.json`
   row — never invent capability fields).
2. Add the profile to `fixtures/model-profiles.json`, copying
   `tool_capable`/embeddings/vision fields verbatim from that ledger row.
3. Set `backend` based on what's actually available on the machine
   running it (`"cpu"` on this laptop; `"metal"`/`"cuda"` only if that
   backend is genuinely present — see `evals/environment-integrity/`'s
   `no_gpu_backend_active` check, which will legitimately FAIL a `"cpu"`
   profile that somehow reports a GPU backend active).
