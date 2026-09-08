# camelid-evals

A multi-layer evaluation framework for [Camelid](https://github.com/timtoole02/Camelid),
a local, OpenAI-compatible inference engine — built and pinned against a
real, specific test environment (HP EliteBook 840 G6, Intel i7-8665U,
CPU-only, 14GB RAM, Ubuntu, Camelid v0.6.1, TinyLlama 1.1B Chat Q8_0
loaded), not an abstract "Camelid in general."

Read `SKILL.md` first — it defines the evaluation discipline (the 7-value
status vocabulary, environment-integrity preflight, model profiles,
process rules) every skill below follows. This file is the map of what's
actually running vs. what's staged for later, with a source citation for
every real claim.

## Functional (real graders, run today via `npm run evals`)

| Skill | What it tests | Grading | Source grounding |
|---|---|---|---|
| `camelid-environment-integrity` | Runs FIRST: confirms the reachable instance is actually the pinned version/model/backend every other oracle here was written against (EI-1..EI-5) | Pure code — `GET /v1/health` against the real `HealthResponse` shape | `src/api/mod.rs`'s `HealthResponse` struct, confirmed at v0.6.1 |
| `camelid-self-conformance` | Camelid's live HTTP behavior against its **own** declared API contract (15 cases: sampling params, streaming, embeddings, fail-closed native-compat routes) | Pure code, no LLM — `scripts/lib/probe.ts` against a real or mock endpoint | `src/api/contract.rs`'s real `API_CONFORMANCE_CASES` registry, transcribed verbatim into `fixtures/api-conformance-registry.json`; each case additionally cites a version-specific `evidence` block (see `docs/V0.6.1_DRIFT_AUDIT.md`) |
| `camelid-regression-museum` | The real, historical stop-sequence streaming-duplication bug (commit `2a893b37`) — split into a characterization case (KB-1: expected on this laptop's unfixed version) and a regression guard (KB-2: `NOT_APPLICABLE` until the fix ships in a real tagged release) | Pure code — exact byte-for-byte expected text, non-streaming vs. streamed | `references/commits/2a893b37.md`; toggled via `BUG_MODE` in `mock-server/server.ts` |
| `camelid-evidence-audit` | Whether a capability claim is actually backed by ledger evidence, in Camelid's own vocabulary | LLM-judged (2-of-3 majority vote) against real ledger rows | `ledger/camelid-ledger.json`'s real `support_policy`, `status`/`support_scope`/`full_support_status` fields, extracted into `fixtures/ledger-excerpt.json` with provenance |
| `camelid-model-compatibility` | Exact-row compatibility questions, including neighbor-row and family-inheritance traps (plus one deliberate counter-trap where inheritance-style reasoning happens to be right) | LLM-judged against real ledger rows | Same ledger excerpt; case 3's counter-trap uses two real, independently `supported_exact_row_smoke` rows |

Run everything: `npm run evals` (semantic domains report `BLOCKED`, not
run, when `ANTHROPIC_API_KEY` is unset — confirmed working, not a
placeholder). Run only the code-only tiers: `npm run evals:automated`.
Run the evaluator's OWN unit tests (zero dependency on a live/mock
Camelid or an API key): `npm test`.

## Scaffold only (SKILL.md + case schema + one example; NOT wired into `run-harness.ts`)

Each of these was deliberately held back per an explicit choice made
before building: go big on scaffolding the discipline and case shape now,
but don't fabricate mocks for layers that need a live, tool-executing, or
multi-backend Camelid instance to test honestly. A fake sandbox, fake
second GPU, or fake vision pipeline would only validate the fake — not
Camelid.

| Skill | Why it's scaffold-only | Real grounding already captured |
|---|---|---|
| `camelid-agent-testing` | Needs a live, tool-capable model behind a real `/api/agent/workspace/sessions` endpoint — a mock's own `tool_calls` field would recreate the exact blind spot that hid the bug below from unit tests | Commit `a6b660cf` ("fix(agent): consume the server's structured tool_calls (loop fired zero tools)") — real, verified, fixed bug (`references/commits/a6b660cf.md`); plus the real `web_workspace` conformance case's exact supported modes and disclaimed capabilities |
| `camelid-security-testing` | Needs a live instance with real GitHub provider-auth credentials and a non-loopback listener to probe request-shape-scoped authorization — re-implementing the scope check in a mock would just test a copy of itself | `src/api/web_research.rs`'s real `github_auth_scope_for_request`/`github_token_for_request` logic; the real `production-server-hardening` safety contract's loopback/non-loopback authentication boundary (`references/safety-contracts/production-server-hardening.md`) |
| `camelid-rag-testing` | Half of this (embeddings/reranking) is **already functional** — see `camelid-self-conformance` — the other half (workspace's internal semantic excerpt injection) needs a live workspace session with the exact embedding row loaded | The real `web_workspace` contract's own language: excerpt injection only "when the exact supported Nomic embedding row is also loaded," excerpts are "explicitly untrusted," and the contract itself disclaims any "persistent vector database, broad retrieval-quality" claim |
| `camelid-multimodal-testing` | Needs a real vision-capable model on the actual gated hardware (Metal or Windows CUDA) with real, verifiable test images — this project's Linux mock server can't honestly simulate "did it see the image" | The real `openai_chat_completions` conformance case's exact mode string `prism_single_image_data_url_metal_or_windows_cuda`, and its explicit `unsupported_modes`: `multiple_images`, `remote_image_urls`, `audio_or_video_input`, `vision_tool_combination` |
| `camelid-hardware-parity` | Grounding data is already fully present (see below) — what's missing is a second real backend (Metal or CUDA) to run a live comparison against | Real `parity_audited`/`performance_measured` fields already in `fixtures/ledger-excerpt.json`, e.g. `qwen3_14b_q4_k_m`'s admitted "external oracle not run" gap, `llama_3_2_3b_instruct_q4_k_m`'s citation of external comparison commit `acd79d6`, and `gemma4_12b_it_qat_q4_0`'s explicit "not a portable throughput claim" caveat. A related, source-traced CPU-only capability boundary (the VNNI-decode graceful-fallback path, and the separate `cpu-kquant-prefill-owner` runtime project) is documented in `references/safety-contracts/cpu-kquant-prefill-owner.md` but not yet cast into this domain's case shape |

Each scaffold skill's directory (`evals/<domain>/`) has a `SCAFFOLD.md`
explaining exactly what would need to be true to graduate it to
functional, a `cases.schema.json`, and one worked (but inert)
`cases.example.json`.

## What was checked and rejected as ungroundable

Before scaffolding, the original proposal that motivated this project's
"combination" scope (behavioral drift + API correctness + performance
benchmarking) was checked against Camelid's real, cloned source rather
than trusted at face value. Most of its claims held up (agent mode, the
tool-calling loop bug, the stop-streaming bug with an exact commit,
embeddings/reranking, multimodal/vision support) — those are the
citations above. One specific claim from that proposal ("duplicate-edit-
anchor refusal") could not be verified against source or commit history
and is not represented anywhere in this repo; it was dropped rather than
built on an unverified premise.

Separately, a full git-archaeology pass (`docs/V0.6.1_DRIFT_AUDIT.md`)
found that the regression-museum bug's own fix (`2a893b37`) postdates
*both* the pinned `v0.6.1` tag and the newer `v0.7.0` — as of this writing
it exists only on `main`/HEAD, in no tagged release. An earlier draft of
this project asserted the post-fix text as correct, which would have
produced a false `FAIL` on every real run against this laptop; this is
recorded as the single most load-bearing catch from that audit, not
smoothed over.

## Project layout

```
SKILL.md                        — the cross-skill evaluation discipline (read first): status vocabulary,
                                   environment integrity, model profiles, process rules
BASELINE_EVAL_PLAN.md           — (in the sibling planning workspace) the full case-by-case design
                                   this build was generated from, including open items not yet closed
fixtures/
  api-conformance-registry.json — real API_CONFORMANCE_CASES, verbatim, with provenance
  ledger-excerpt.json           — real ledger rows, verbatim, with provenance
  runtime-capabilities.json     — real config/runtime-capabilities.json, verbatim, with provenance
  model-profiles.json           — what each of the 5 real, on-disk models can actually do
docs/
  V0.6.1_DRIFT_AUDIT.md         — the git-archaeology findings behind every version-specific citation
  MODEL_PROFILES.md             — the 5 real model profiles and how to add another
  RUNTIME_CAPABILITIES.md       — index over the 7 real runtime-capability projects
references/
  commits/                     — one file per real commit this project cites (full message, provenance)
  safety-contracts/            — one file per real runtime-capabilities.json safety_contract this project cites
skills/
  camelid-environment-integrity/ — functional
  camelid-self-conformance/      — functional
  camelid-regression-museum/     — functional
  camelid-evidence-audit/        — functional
  camelid-model-compatibility/   — functional
  camelid-agent-testing/         — scaffold
  camelid-security-testing/      — scaffold
  camelid-rag-testing/           — scaffold
  camelid-multimodal-testing/    — scaffold
  camelid-hardware-parity/       — scaffold
evals/<domain>/                 — cases.json (functional) or SCAFFOLD.md + cases.schema.json + cases.example.json (scaffold)
scripts/                        — the executable harness and its libraries
tests/                          — unit tests for the evaluator's OWN code (scripts/lib/*.ts), separate
                                   from evals/ (tests Camelid) and mock-server/ (simulates Camelid);
                                   zero dependency on CAMELID_BASE_URL or ANTHROPIC_API_KEY
mock-server/                    — dependency-free mock of Camelid's chat/embeddings HTTP surface, with deliberate-break toggles
.github/workflows/evals.yml     — CI: automated tiers always; semantic tiers when ANTHROPIC_API_KEY is configured
```

## Running it yourself

```bash
npm install
cp .env.example .env   # set CAMELID_BASE_URL to a real instance, or leave default for the mock

# Option A: against the bundled mock (no live Camelid needed)
npm run mock-server &
npm run evals

# Option B: against a real local Camelid instance
# edit .env: CAMELID_BASE_URL=http://127.0.0.1:8181 (or wherever yours listens)
npm run evals

# The evaluator's own unit tests — no live/mock Camelid or API key needed
npm test
```

Set `ANTHROPIC_API_KEY` in `.env` to also run the semantic (LLM-judged)
domains; without it they report `BLOCKED`, not a failure. Set
`CAMELID_MODEL_PROFILE` to switch which of the 5 real model profiles is
treated as active (see `docs/MODEL_PROFILES.md`) — this gates which cases
even attempt to run, rather than letting a capability mismatch masquerade
as a Camelid defect.
