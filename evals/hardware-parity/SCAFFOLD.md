# Hardware-parity evals — scaffold only

## Why this isn't wired into `npm run evals`

This is the one scaffold domain where the *grounding data* is already
fully present and functional-quality (`fixtures/ledger-excerpt.json`'s
`parity_audited`/`performance_measured` fields, real and verbatim from the
real ledger). What's missing isn't data, it's hardware: verifying or
re-running a cross-backend parity claim means having at least two of
{CPU, Metal, CUDA} actually reachable at once. This project's mock server
and CI runner target one Linux box — there is no second GPU backend here
to compare against, and simulating "what CUDA would say" would just be
inventing the answer the eval is supposed to discover.

## What would need to be true to graduate this

1. At least two real backends reachable from the same harness run (e.g. a
   Mac with Metal and a Windows/Linux box with CUDA, or either plus a CPU
   reference build) serving the *same* model row.
2. A deterministic-decode setup (greedy, fixed seed/prompt) so outputs are
   directly diffable across backends — mirroring how the real
   `parity_audited` strings already describe their own methodology
   (e.g. "8_of_8_raw_greedy_tokens").
3. Optionally, an external oracle build (e.g. a pinned llama.cpp commit,
   the same way `llama_3_2_3b_instruct_q4_k_m`'s real row cites `acd79d6`)
   to compare against, if the goal is auditing against something other
   than Camelid's own other backend.
4. A grader that diffs token-for-token output (not just prose similarity)
   for the parity claim, and a separate, clearly-labeled path for
   performance numbers that never generalizes a single machine's
   measurement into a portable claim — per the real
   `gemma4_12b_it_qat_q4_0` row's own explicit caveat.

## Case shape

See `cases.schema.json` and `cases.example.json`. Every example case here
references a REAL row already in `fixtures/ledger-excerpt.json` — no new
fixture is needed to start writing cases, only a second backend to run
them against.
