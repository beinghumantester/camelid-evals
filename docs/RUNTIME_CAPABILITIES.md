# Runtime capabilities registry

`fixtures/runtime-capabilities.json` is a verbatim transcription of the
real `config/runtime-capabilities.json` at the `timtoole02/Camelid`
`v0.6.1` tag — the **third** self-declared, machine-readable contract this
project grounds itself in, alongside `src/api/contract.rs` (API
conformance, → `fixtures/api-conformance-registry.json`) and
`ledger/camelid-ledger.json` (model rows, →
`fixtures/ledger-excerpt.json`).

## What it tracks

Where the API-conformance registry declares request/response contract
behavior and the ledger declares per-model support status, this registry
declares the status of **experimental/runtime engineering features** —
things that are either off by default, gated behind an env var, or both —
along with a plain-language `safety_contract` per feature and the real
test names that back it.

## The 7 real projects (v0.6.1)

| id | project # | status | default_enabled | gating env var(s) |
|---|---|---|---|---|
| `runtime-capability-registry` | 2 | `implemented` | true | — |
| `mixtral-moe-completion` | 3 | `diagnostic_gate_hardened_parity_blocked` | false | `CAMELID_MOE_EXPERT_STORAGE`, `CAMELID_MIXTRAL_LONG_GENERATION` |
| `cpu-kquant-prefill-owner` | 4 | `parity_gated` | false | `CAMELID_X86_KQUANT_MATMUL_OWNER` |
| `indexed-ngram-speculation` | 5 | `implemented_default_when_ngram_selected` | false | `CAMELID_SPEC_DECODE=ngram`, `CAMELID_NGRAM_INDEX_MAX_ENTRIES` |
| `unified-kv-sequence-pool` | 6 | `foundation_default_off` | false | `CAMELID_KV_POOL_BUDGET_BYTES` |
| `continuous-batch-scheduler` | 7 | `integrated_default_two_streaming_slots` | true | `CAMELID_CONTINUOUS_BATCH_SLOTS` |
| `production-server-hardening` | 8 | `implemented` | true | `CAMELID_API_KEY`, `CAMELID_API_KEY_FILE`, `CAMELID_CORS_ORIGINS`, `CAMELID_ALLOW_UNAUTHENTICATED_REMOTE`, `CAMELID_TLS_CERT`, `CAMELID_TLS_KEY`, `CAMELID_MAX_REQUEST_BODY_BYTES`, `CAMELID_MAX_PROMPT_TOKENS`, `CAMELID_MAX_GENERATION_TOKENS`, `CAMELID_MAX_DOWNLOAD_BYTES` |

Full `safety_contract` text and `evidence` (real test names) for each
project are preserved verbatim in `fixtures/runtime-capabilities.json`
itself — this table is an index, not a replacement.

## How this project uses it

- **`production-server-hardening`** grounds the security scaffold — see
  `references/safety-contracts/production-server-hardening.md` and
  `evals/security/SCAFFOLD.md`.
- **`cpu-kquant-prefill-owner`** grounds a documented-but-not-yet-runnable
  CPU capability case — see
  `references/safety-contracts/cpu-kquant-prefill-owner.md`. Distinct
  from CP-1 (the VNNI-decode fallback), which is inline dispatch code in
  `src/inference.rs` rather than a registered runtime-capability project.
- The other five projects (`runtime-capability-registry`,
  `mixtral-moe-completion`, `indexed-ngram-speculation`,
  `unified-kv-sequence-pool`, `continuous-batch-scheduler`) are not
  currently exercised by any case in this project — none of the five real
  model profiles in `fixtures/model-profiles.json` are MoE, and neither
  speculative decoding nor the batch scheduler have a case that targets
  them yet. They're transcribed here because the fixture is transcribed
  as a whole file (never partially, to avoid quietly deciding which
  entries "matter"), not because every entry has a consumer today.

## The one universal rule across all three registries

`runtime-capability-registry`'s own `safety_contract` states it plainly,
and it generalizes to the other two registries this project uses:

> "Runtime project status is distinct from exact model support and cannot
> promote model compatibility rows."

A feature being `implemented` here says nothing about whether any
specific model row in the ledger is supported, and vice versa — this is
the same evidence-boundary discipline behind
`evals/evidence-audit/cases.json`'s "supported for X doesn't mean
supported for Y" traps.
