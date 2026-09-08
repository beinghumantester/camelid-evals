# Camelid Baseline Evaluation Plan — v0.6.1 / HP EliteBook 840 G6

Status: **design only — no SKILL.md, eval JSON, or scripts written yet.**
This document is the thing to argue with before any of that gets built.

Every citation below was checked against the actual `timtoole02/Camelid`
source at the `v0.6.1` tag (not `main` HEAD) in this session. Where I
haven't nailed something down to an exact line/field, it's marked
`UNVERIFIED` rather than guessed — per the rule we agreed on, the plan
should never upgrade an assumption to a claim.

## Status vocabulary (as agreed)

| Status | Meaning |
|---|---|
| `PASS` | Expected behavior observed |
| `FAIL` | Applicable test produced unexpected behavior |
| `KNOWN_DEFECT` | Failure is already known and expected for this pinned version |
| `NOT_APPLICABLE` | Environment cannot exercise the capability at all (missing hardware) |
| `BLOCKED` | Capability could be tested in principle, but the required model/config/credential isn't loaded |
| `UNVERIFIED` | Not enough evidence yet to assert an oracle |
| `ERROR` | The evaluation infrastructure itself failed, not Camelid |

The last column in every table below (**"On this laptop, today"**) is what
running the suite against your exact environment would report *before*
any code changes are made — it's the target behavior we're designing for.

## Environment profile this plan targets

```
Camelid version   = 0.6.1 (official camelid-linux-x86_64.tar.gz, checksum-verified)
OS                = Ubuntu 26.04.1 LTS x86_64
CPU               = Intel Core i7-8665U, 4c/8t, 1.90GHz (Whiskey Lake — AVX2 yes, AVX-512/VNNI no)
GPU               = none (integrated Intel graphics only) — no Metal, no CUDA
RAM               = 14 GB
Disk              = 468 GB total, ~390 GB free
Loaded model      = TinyLlama 1.1B Chat Q8_0 (tool_capable: false, per ledger row)
```

---

## 0. Environment integrity (EI) — must run first, gates confidence of everything after it

Per principle #12: before trusting any other result, confirm we're actually
testing the environment we think we're testing.

| ID | Check | Oracle (v0.6.1 source) | On this laptop, today |
|---|---|---|---|
| EI-1 | `GET /v1/health` → `version == "0.6.1"` | `HealthResponse.version`, `src/api/mod.rs:560-565` — "Release version of the running engine (the crate version, e.g. `0.4.7`)" | RUN |
| EI-2 | `GET /v1/health` → `build` is a release build, not a dev/git-describe drift string | `HealthResponse.build` doc comment: "On a released binary these two agree; on a developer build this is the field that says how far the process has drifted from a tag." — src/api/mod.rs:566-570 | RUN |
| EI-3 | `active_model_id` matches the TinyLlama row id, `backend == "llama"` | `HealthResponse.active_model_id`/`backend`, src/api/mod.rs:574, 580-581 (backend is literally the string `"llama"` for llama-family GGUF, confirmed at src/api/mod.rs:3437) | RUN |
| EI-4 | `vision_ready == false` | `HealthResponse.vision_ready` — "True when the active runnable model has a resident Prism/Qwen3-VL projector" — src/api/mod.rs:573-575; TinyLlama has no projector | RUN |
| EI-5 | No Metal/CUDA active in `q8_runtime`/`execution_plan` fields | `Q8RuntimeFlags.metal`/`.cuda` booleans exist per src/inference/q8_runtime.rs:96-99, surfaced through `HealthResponse.q8_runtime` (src/api/mod.rs:576) — exact JSON key path is `UNVERIFIED`, needs one live capture | RUN (oracle needs one live confirmation of the exact field path) |

If any of EI-1..EI-5 comes back wrong, every other result in the run should be downgraded to `UNVERIFIED`, not trusted at face value — that's the "stop or downgrade confidence" rule from principle #12.

---

## 1. API sampling & validation — re-cited for v0.6.1 (was previously mis-cited against HEAD-only contract.rs entries)

Confirmed: `contract.rs` had **20** self-declared conformance cases at `v0.6.1` vs **28** on current `main` — the `sampling_temperature`/`top_p`/`top_k`/`min_p`/`seed`/`stop`/`repeat_penalty` entries as *named contract.rs cases* are HEAD-only additions. But the underlying **runtime validation and the typed `invalid_sampling_parameter` error code already existed at v0.6.1** — confirmed present in `src/api/mod.rs` (hits at lines 10266, 10275, 15656, 15665) and asserted in `tests/api_vertical_slice.rs` (lines 2021, 2044, 2067, 2090) at that same tag. So per the behavioral-oracle / evidence-reference split: the *behavior* is real for v0.6.1, the *citation* changes from "contract.rs → sampling_temperature" to "runtime validation + vertical-slice test, pre-dating the contract.rs entry."

| ID | Check | Behavioral oracle | Evidence reference (v0.6.1) | On this laptop, today |
|---|---|---|---|---|
| SC-1 | `temperature < 0` or non-finite → typed 400 `invalid_sampling_parameter` | Same param struct exists at v0.6.1 (`Option<f32>` field, unchanged shape) | src/api/mod.rs (typed-error dispatch, ~10266/15656) + tests/api_vertical_slice.rs:2021 | RUN |
| SC-2 | `top_p` outside `(0, 1]` → typed 400 | same | same test file, exact line-per-param mapping `UNVERIFIED` (confirmed the code path exists, haven't isolated which of the 4 test assertions maps to which param) | RUN |
| SC-3 | `top_k == 0` → typed 400 `invalid_sampling_parameter` | `top_k: Option<u32>` field confirmed present at v0.6.1 (src/api/mod.rs, multiple hits) | same | RUN |
| SC-4 | `top_k < 0` → **not** a typed error — malformed-JSON 400 instead (can't deserialize a negative number into `u32`) | `u32` field type is a Rust/serde type-system fact, not app logic — confirmed the field was already `u32` at v0.6.1 | field type confirmed at v0.6.1; behavior follows from serde, not a version-specific code path | RUN |
| SC-5 | `min_p` outside `[0, 1]` → typed 400 | `min_p: Option<f32>` confirmed present at v0.6.1 | tests/api_vertical_slice.rs (one of the 4 hits) | RUN |
| SC-6 | Same seed + same request → identical text; different seeds NOT guaranteed to differ (real documented meta-trap, not a bug) | seed-reproducibility behavior — `UNVERIFIED` whether this exact framing existed at v0.6.1 vs was documented later; the field itself is old | needs one more grep before finalizing | UNVERIFIED — verify before writing this case |
| SC-7 | `stop` array: empty, empty string, or >4 entries → typed 400 | `UNVERIFIED` — haven't isolated the exact v0.6.1 validation line for `stop`, only confirmed the general `invalid_sampling_parameter` machinery exists | — | UNVERIFIED — verify before writing this case |

SC-6 and SC-7 are flagged honestly as not yet nailed down — everything else in this section I'm confident citing.

---

## 2. Streaming & response-shape behavior

| ID | Check | Oracle | On this laptop, today |
|---|---|---|---|
| ST-1 | Non-streaming vs. streaming replies concatenate to the same text (outside the known-defect case in §3) | `openai_chat_completions` contract case, confirmed present and materially unchanged at v0.6.1 | RUN |
| ST-2 | `stream_options.include_usage:true` appends one terminal chunk with `choices:[]` and a `usage` object matching the non-streaming count, then `[DONE]` | `stream_options.include_usage` contract case, confirmed present at v0.6.1 (src/api/contract.rs:197-202 at that tag) | RUN |
| ST-3 | `n` (multi-choice) generation works non-streaming for 1..=8, and streaming+multi-choice is rejected/unsupported | `multi_choice_generation` contract case, confirmed present at v0.6.1 | RUN |

---

## 3. Known historical bug — split per your instruction, not merged into one regression test

| ID | Check | Oracle | On this laptop, today |
|---|---|---|---|
| KB-1 | **Characterization test**: send `stop:["><"], max_tokens:2` streaming; **expect the duplicated-text bug** (`"<unk><unk"` reassembled client-side, not `"<unk"`) | Commit `2a893b37` ("fix(api): stop the dense streaming lane duplicating a reply on a straddling stop") — confirmed this fix landed 2026-09-06, a month **after** the `v0.6.1` tag (2026-08-08), and confirmed the pre-fix buggy code was already present in `v0.6.1`'s `src/api/mod.rs` | **KNOWN_DEFECT** (expected, not counted as a regression) |
| KB-2 | **Regression guard**: same request, expect the *fixed* text (`"<unk"`, no duplication) | Same commit — this is the post-fix behavioral contract | **NOT_APPLICABLE for v0.6.1** — this case activates once you're on a build that includes `2a893b37` or later (`v0.6.1` does not) |

Report line for KB-1, exactly as you specified:
> **KNOWN DEFECT — expected for this pinned version; not counted as a regression.**

---

## 4. Agent runtime — model-independent contracts (per your A/B/C split)

These test Camelid's own enforcement, not TinyLlama's ability to decide to call a tool — so they don't need a tool-capable model loaded.

| ID | Check | Oracle | On this laptop, today |
|---|---|---|---|
| AR-1 | A workspace session request with `allow_writes=true` is rejected outright | Real `web_workspace` contract: "`allow_writes=true` is rejected" (confirmed present, materially unchanged, at v0.6.1's contract.rs) | RUN |
| AR-2 | Workspace refuses to serve non-loopback connections | `HealthResponse`/server doc: "Workspace is disabled when [listener address] is non-loopback" — need one more v0.6.1-specific grep to confirm exact wording didn't shift; currently sourced from HEAD | UNVERIFIED — confirm wording/behavior unchanged at v0.6.1 before finalizing |
| AR-3 | Only `read_file`/`list_dir`/search tools are ever offered in a workspace session; no write/shell/network/subagent tool ever appears | Same contract, `supported_modes: ["read_only_tools", "durable_threads"]`, confirmed present at v0.6.1 | RUN |
| AR-4 | A workspace session step that exceeds the documented 90-second model-step deadline is cut off cleanly (typed timeout), not hung or crashed | Referenced in the real `web_workspace` contract notes; exact v0.6.1 wording `UNVERIFIED` (currently sourced from HEAD's more detailed contract note — v0.6.1's contract note for this case is shorter, see §7) | UNVERIFIED |

## 5. Agent — model-dependent tool-use behavior (explicitly NOT run against TinyLlama)

| ID | Check | Oracle | On this laptop, today |
|---|---|---|---|
| AM-1 | Given a tool-capable model, does it correctly emit `read_file`/`list_dir` via the structured `tool_calls` field (not empty `content`)? | Commit `a6b660cf` — confirmed **already included** in `v0.6.1` (landed 2026-06-28, before the 2026-08-08 tag) | **BLOCKED** — TinyLlama's ledger row says `tool_capable: false`; this needs a different loaded model |
| AM-2 | Can the model select the correct tool among several offered, without looping or repeating a call | No specific commit citation yet — general agent-loop behavior | **BLOCKED** — same reason |

---

## 6. CPU hardware-capability boundary (replaces the Metal/CUDA hardware-parity idea for this laptop)

This is the reframed test per your point 4: not "does VNNI work" (it can't, no VNNI here) but "does Camelid safely handle an explicitly requested optimization the hardware doesn't support."

| ID | Check | Oracle (traced through actual v0.6.1 dispatch code, not assumed) | On this laptop, today |
|---|---|---|---|
| CP-1 | Force `CAMELID_X86_Q8_FFN_DOWN_VNNI_DECODE_RAWPTR=on` on a CPU without AVX-512-VNNI; confirm Camelid falls back safely rather than crashing or corrupting output | Traced the real dispatch in `src/inference.rs:14722-14751` (v0.6.1): the code checks `down_route.packed.vnni_packed.as_ref()` — when no VNNI-packed representation exists (i.e., hardware doesn't support it), it calls `record_q8_ffn_down_vnni_decode_reject(&Q8_SCHED_FFN_DOWN_VNNI_DECODE_REJECT_NO_VNNI_PACK, "no_vnni_pack", ...)` and falls back to `q8_0_packed_rows4_single_input_projection_with_decode_chunking` — the ordinary baseline path. **This is a real, telemetry-recorded, graceful fallback, not a crash — confirmed from source, not assumed.** | RUN — expect **PASS** (graceful fallback), and this is now a much stronger claim than "we assume it degrades gracefully" |
| CP-2 | The `no_vnni_pack` rejection is externally observable (not just internal telemetry) | `q8_schedule` field appears in the chat-completion response body when schedule telemetry is enabled (`src/api/mod.rs:17560`, confirmed at v0.6.1) — exact env var to enable telemetry collection is `UNVERIFIED`, needs one more grep (`q8_schedule_telemetry_enabled()`'s implementation) | UNVERIFIED — need the exact enable-flag name before this is fully black-box testable |
| CP-3 | Baseline AVX2 path (no experimental flags) produces greedy-deterministic output; enabling a *supported* AVX2-only optimization flag (e.g. `CAMELID_X86_Q8_KERNEL=avx2`) doesn't change the token output, only latency | General parity discipline documented throughout `qa/evidence-bundles/` — this CPU can actually exercise this one meaningfully since AVX2 is present | RUN |

CP-1 is the one I'd flag as genuinely well-grounded now — this isn't "comparing your laptop to an M4," it's tracing the actual fallback code path your exact CPU will hit.

---

## 7. Security — GitHub provider-auth scoping (grounded, but credential-gated)

| ID | Check | Oracle | On this laptop, today |
|---|---|---|---|
| SEC-1 | Owner mismatch on an otherwise-valid `GithubRepositoryMetadata`-shaped request withholds the token | `github_auth_scope_for_request()` / `github_token_for_request()`, `src/api/web_research.rs` — confirmed present in current source; **not yet re-verified against v0.6.1 specifically** | UNVERIFIED (logic likely present at v0.6.1 given how foundational it is, but not confirmed) |
| SEC-2 | Repo mismatch withholds the token | same | UNVERIFIED, same caveat |
| SEC-3 | Wrong `Accept` header withholds the token | same | UNVERIFIED, same caveat |
| SEC-4 | Workspace `allow_writes=true` rejection (duplicate of AR-1, listed here too since it's a security boundary, not just an agent-capability one) | see AR-1 | RUN |

SEC-1..3 additionally need a real (test-scoped) GitHub token configured to run live — even once the v0.6.1 citation is confirmed, they're `BLOCKED` on credentials, not just `UNVERIFIED` on version.

---

## 8. Evidence-audit & model-compatibility (semantic, LLM-judged) — unaffected by hardware

These never call Camelid — they test an LLM auditor's reasoning over the real ledger's text. Hardware, OS, and Camelid version are irrelevant here; only `ANTHROPIC_API_KEY` gates them.

| ID | Check | On this laptop, today |
|---|---|---|
| EA-1..4 | The 4 existing evidence-audit cases (overclaim trap, "loads" vs "validated" trap, ambiguous-version trap, support-scope trap) | RUN if `ANTHROPIC_API_KEY` set, else `BLOCKED — reason: no API key`, never `NOT_APPLICABLE` (nothing about hardware blocks these) |
| MC-1..4 | The 4 existing model-compatibility cases (neighbor-row, family-inheritance, counter-trap, evidence-insufficiency) | Same |

One correction from the earlier build: these were previously reported as `SKIPPED`. Under the new vocabulary they should say `BLOCKED — reason: ANTHROPIC_API_KEY not set`, which is more honest than a bare `SKIPPED`.

---

## 9. Conditional capability packs — defined now, not run against this environment

| ID | Check | Required model profile | On this laptop, today |
|---|---|---|---|
| CAP-EMB-1 | `/v1/embeddings` shape + `search_query`/`search_document` prefix behavior | `nomic-embed-v1.5-q8` profile loaded | **BLOCKED** — reason: loaded model profile is `tinyllama-1.1b-q8` (capabilities: embeddings=no) |
| CAP-EMB-2 | `/rerank` bi-encoder behavior | same | **BLOCKED**, same reason |
| CAP-VIS-1 | `prism_single_image_data_url_metal_or_windows_cuda` | vision-capable model + Metal or Windows CUDA backend | **NOT_APPLICABLE** — reason: required backend is Metal or CUDA; available backend is CPU only (Intel i7-8665U, no NVIDIA GPU, no Apple Silicon) |
| CAP-CUDA-1 | Any CUDA-specific lane (e.g. `gemma4_ghost_common_metal_active`-adjacent CUDA paths) | NVIDIA GPU present | **NOT_APPLICABLE** — reason: no NVIDIA GPU on this machine |
| CAP-METAL-1 | Any Metal-specific lane | Apple Silicon | **NOT_APPLICABLE** — reason: not Apple hardware |

---

## Model profiles (as you specified)

```
Model profile: tinyllama-1.1b-q8   [ACTIVE on this laptop]
  Backend: CPU
  Capabilities: chat=yes, tools=no, embeddings=no, vision=no
  Ledger status at v0.6.1: supported_current_gate (contract.status, ledger row
    "tinyllama_1_1b_chat_q8_0" — confirmed byte-identical between v0.6.1 and
    HEAD except one cosmetic docs-path field)

Model profile: nomic-embed-v1.5-q8  [not loaded]
  Backend: CPU
  Capabilities: chat=no, tools=no, embeddings=yes, reranking=yes

Model profile: <tool-capable model, e.g. llama32-3b-instruct-q8>  [not loaded]
  Backend: CPU
  Capabilities: chat=yes, tools=yes, embeddings=no, vision=no

Model profile: <vision-capable model>  [not loaded, and NOT_APPLICABLE on this
  hardware regardless — requires Metal/CUDA backend this laptop doesn't have]
  Capabilities: vision=yes
```

Every eval case above declares which profile it needs; the harness selects applicable cases from the *active* profile and marks the rest `BLOCKED`/`NOT_APPLICABLE` rather than silently omitting them from the report.

---

## Compatibility matrix (generated from the tables above, not asserted independently)

| Eval group | v0.6.1 | tinyllama profile | CPU-only | On this laptop, today |
|---|---:|---:|---:|---:|
| EI (environment integrity) | ✓ | ✓ | ✓ | RUN |
| Sampling/validation (SC-1..5) | ✓ | ✓ | ✓ | RUN |
| Sampling/validation (SC-6, SC-7) | UNVERIFIED | ✓ | ✓ | UNVERIFIED |
| Streaming (ST-1..3) | ✓ | ✓ | ✓ | RUN |
| Known-bug characterization (KB-1) | ✓ (bug present) | ✓ | ✓ | KNOWN_DEFECT |
| Regression guard (KB-2) | ✗ (fix not present) | ✓ | ✓ | NOT_APPLICABLE |
| Agent runtime, model-independent (AR-1, AR-3) | ✓ | ✓ | ✓ | RUN |
| Agent runtime, model-independent (AR-2, AR-4) | UNVERIFIED | ✓ | ✓ | UNVERIFIED |
| Agent, model-dependent (AM-1, AM-2) | ✓ | ✗ (tool_capable=false) | ✓ | BLOCKED |
| CPU capability boundary (CP-1, CP-3) | ✓ | — | ✓ | RUN |
| CPU capability boundary (CP-2) | ✓ (field exists) | — | ✓ | UNVERIFIED (env var name) |
| Security (SEC-1..3) | UNVERIFIED | — | ✓ | UNVERIFIED + BLOCKED (no token) |
| Security (SEC-4 = AR-1) | ✓ | ✓ | ✓ | RUN |
| Evidence-audit / model-compat (EA, MC) | irrelevant | irrelevant | irrelevant | BLOCKED on API key only |
| Embeddings/reranking (CAP-EMB) | ✓ | ✗ | ✓ | BLOCKED |
| Vision (CAP-VIS) | ✓* | ✗ | ✗ | NOT_APPLICABLE |
| CUDA/Metal (CAP-CUDA, CAP-METAL) | ✓* | — | ✗ | NOT_APPLICABLE |

`*` = confirmed present in v0.6.1's contract.rs as a declared capability; not independently re-verified beyond the registry text itself for this table.

---

## Open items — needs one more check before an eval in that row is finalized

1. SC-6 (seed reproducibility framing) and SC-7 (`stop` array validation) — confirm exact v0.6.1 code location, not just "the general mechanism exists."
2. AR-2 and AR-4 — confirm the loopback-only and 90-second-deadline wording is unchanged at v0.6.1 (currently sourced from HEAD's contract note, which is more detailed than v0.6.1's).
3. EI-5 — exact JSON field path for Metal/CUDA-off confirmation inside `q8_runtime`/`execution_plan`.
4. CP-2 — the exact environment variable that flips on `q8_schedule_telemetry_enabled()`.
5. SEC-1..3 — confirm `github_auth_scope_for_request`/`github_token_for_request` logic is present (not just on HEAD) at v0.6.1, and separately, get a test-scoped GitHub token before these can run live.

Total baseline cases defined above: **38** (EI 5, SC 7, ST 3, KB 2, AR 4, AM 2, CP 3, SEC 4, EA+MC 8, CAP 5 minus 1 overlap counted once — SEC-4/AR-1 is the same case listed twice for cross-reference).

---

## What I'd want your decision on before writing anything

1. Do the 5 "open items" above get resolved now (I do the greps) before we finalize the case list, or do we accept them as `UNVERIFIED` placeholders in the first build and confirm them when the harness actually runs against your live machine?
2. Is 38 cases the right baseline size, or do you want to cut/merge any category (e.g. SEC-1..3 might not be worth defining in detail while they're both unverified-for-version *and* credential-blocked)?
3. For KB-2 (the regression guard) — do you want it physically present in the suite marked `NOT_APPLICABLE`, or left out of the case file entirely until you upgrade, with just a note in the plan?
4. Confirm the model-profile mechanism itself: should "which profile is active" be something the harness detects live (via `GET /v1/health`'s `active_model_id`), or something you declare in a config file per run? Detecting it live is more honest but means the harness needs network access to your instance even just to decide which cases to run.