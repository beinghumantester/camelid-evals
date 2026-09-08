---
name: camelid-hardware-parity
description: SCAFFOLD ONLY — evaluation discipline for cross-backend (CPU/Metal/CUDA) numerical and performance parity claims, grounded in the real, already-fixtured parity_audited/performance_measured ledger fields. Not yet wired to an executable grader.
---

# Camelid Hardware-Parity Auditor (scaffold only)

## Status

**This skill is not executable.** Absent from `scripts/run-harness.ts`'s
domain list — not because the grounding data is missing (it's already
sitting in `fixtures/ledger-excerpt.json`, ingested for the
`model-compatibility` and `evidence-audit` domains) but because verifying
a parity claim means *re-running* the comparison across two or more real
backends, and only one backend (whatever this Linux box's mock server
simulates) is reachable from here.

## Why this is real, not speculative — and unusually rich already

The ledger rows already fixtured in this repo carry a `parity_audited`
field per row, and its real values are wildly heterogeneous — which is
itself the finding. Reading them verbatim out of
`fixtures/ledger-excerpt.json`:

- `qwen3_14b_q4_k_m`: `"metal_equals_deterministic_cpu_for_8_of_8_raw_greedy_tokens_external_oracle_not_run"`
  — Metal matches CPU exactly for 8/8 tokens, but the row itself flags that
  no *external* oracle (e.g. llama.cpp) was run. A claim that this row is
  "cross-backend validated" would overstate what the row itself admits.
- `llama_3_2_3b_instruct_q4_k_m`: cites an explicit external comparison —
  `"...documented_gpu_resident_cuda_vs_llamacpp_acd79d6"` — a real commit
  hash (`acd79d6`) as the comparison oracle.
- `gemma4_12b_it_qat_q4_0`'s `performance_measured` field states
  verbatim: `"single_apple_m4_measurement_exists_not_a_portable_throughput_claim"`
  — the row itself explicitly warns against generalizing one machine's
  number into a general Metal-throughput claim. This is exactly the trap
  a naive evaluator would fall into: "it's fast on Metal" vs. "it was
  measured once, on one M4, and the row says don't generalize that."
- `phi4_mini_instruct_q4_k_m`: `parity_audited: "failed"`, paired with
  `status: active_validation_blocked_parity` — a row that *failed* its
  parity check, not merely an unaudited one; conflating these two is a
  guardrail violation on its own.
- `deepseek_r1_distill_qwen_7b_q8_0`: `parity_audited: "not_started"` — no
  claim has even been attempted yet; this is different again from "failed"
  and from "audited with a caveat."

Four distinct real states already exist in the fixture data alone: audited
internally with an admitted gap (`qwen3_14b_q4_k_m`), audited against an
external oracle by commit hash (`llama_3_2_3b_instruct_q4_k_m`), audited
and failed (`phi4_mini_instruct_q4_k_m`), and not started
(`deepseek_r1_distill_qwen_7b_q8_0`). A grader that treats any two of
these as equivalent is wrong.

## Guardrails (to carry forward when this graduates to executable)

1. **Quote the row's real `parity_audited` string verbatim before
   characterizing it.** Never compress it to "passed" or "validated" —
   the string itself usually carries the caveat (external oracle run or
   not, how many tokens, which backends).
2. **A single-machine performance measurement is not a portable
   throughput claim, even when the row's own language doesn't say so
   explicitly.** Where it does say so explicitly (e.g.
   `gemma4_12b_it_qat_q4_0`), treat that as binding, not as one
   interpretation among several.
3. **`parity_audited: "failed"` and `parity_audited: "not_started"` are
   both non-passing, but they are not the same finding** — one attempted
   and failed a check, the other never attempted one. State which.
4. **Never infer one row's parity status from a sibling row's, even
   within the same family or quantization** — this is the same
   neighbor-row discipline as `camelid-model-compatibility`, applied to
   parity specifically.
5. **A future live comparison must cite the exact backends and exact
   commit/oracle used**, mirroring the specificity already present in the
   real fixture data (e.g. citing `acd79d6` the way the real row does) —
   never a vague "compared across backends."
6. **No release/adoption authority.** State what the real parity evidence
   shows and doesn't; leave any decision to rely on a backend to the human
   asking.

## Instructions (for the future executable version)

1. Before running any live comparison, read the target row's existing
   `parity_audited` and `performance_measured` fields in full and restate
   them verbatim — this is the baseline claim being extended or
   re-verified, not replaced.
2. If re-running a parity check, use the same class of oracle the
   existing claim used where one exists (e.g. the same llama.cpp commit)
   so results are comparable; if using a different oracle, say so
   explicitly rather than presenting it as confirming the same claim.
3. Report new performance numbers with the same specificity the existing
   fixture data uses — exact hardware, exact measurement conditions —
   never a bare "N tokens/sec" without machine and condition.
4. Cite the exact row id and exact field values (old and newly measured)
   so the result is auditable against `fixtures/ledger-excerpt.json`.
