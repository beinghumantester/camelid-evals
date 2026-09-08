# Safety contract: `cpu-kquant-prefill-owner`

**Source:** `config/runtime-capabilities.json` at the real
`timtoole02/Camelid` `v0.6.1` tag, transcribed verbatim into
`fixtures/runtime-capabilities.json` (project id `cpu-kquant-prefill-owner`,
project number 4).

**Used by:** the CP-2 line of investigation in `BASELINE_EVAL_PLAN.md`'s
CPU hardware-capability section; related to (but distinct from) CP-1's
VNNI-decode fallback trace, which lives in inline `src/inference.rs` code
rather than as a registered runtime-capability project.

## Real fields (verbatim from the fixture)

```json
{
  "id": "cpu-kquant-prefill-owner",
  "project": 4,
  "status": "parity_gated",
  "default_enabled": false,
  "configuration": ["CAMELID_X86_KQUANT_MATMUL_OWNER"],
  "dependencies": ["runtime-capability-registry"],
  "evidence": [
    "inference::tests::q4_k_owner_prefill_bitwise_matches_block_dot_core",
    "inference::tests::q6_k_owner_prefill_bitwise_matches_block_dot_core"
  ],
  "safety_contract": "Owner dispatch remains opt-in until repeatable end-to-end prefill receipts show a win; outputs must remain bit-identical to block-dot."
}
```

## What this means for this laptop, specifically

`default_enabled: false` and `status: "parity_gated"` together mean: this
is an experimental, off-by-default alternate prefill code path for
K-quantized (Q4_K/Q6_K) matmul, gated behind
`CAMELID_X86_KQUANT_MATMUL_OWNER`, and Camelid's own contract is that
turning it on must never change output — only, potentially, latency. The
two named tests (`q4_k_owner_prefill_bitwise_matches_block_dot_core`,
`q6_k_owner_prefill_bitwise_matches_block_dot_core`) are exactly this
claim: bitwise identity between the "owner" dispatch path and the
baseline `block_dot` path.

This is directly relevant to CP-3 in `BASELINE_EVAL_PLAN.md` ("enabling a
supported AVX2-only optimization flag doesn't change the token output,
only latency") — `cpu-kquant-prefill-owner` is a second, independently
real instance of the same discipline (an opt-in performance flag with an
explicit bit-identical-output safety contract), not a one-off.

## Why this isn't wired into `npm run evals` yet

Confirming this black-box (without reading Rust source) means: run the
same deterministic prompt through Camelid with
`CAMELID_X86_KQUANT_MATMUL_OWNER` unset, then set, and diff the two
completions token-for-token. This laptop's TinyLlama Q8_0 model is not
K-quantized (Q4_K/Q6_K), so this specific flag has nothing to act on with
the currently active profile — it would need one of the K-quant model
rows (not present in `fixtures/model-profiles.json`'s five real profiles,
none of which are K-quant) to be a meaningful black-box test at all. Until
a K-quant model profile is added, this stays a documented, real,
source-grounded capability rather than an executable case.
