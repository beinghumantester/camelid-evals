---
name: camelid-model-compatibility
description: Answers exact-row model compatibility questions for Camelid — including family-inheritance and neighbor-row traps — using only the real ledger row(s) provided, never a family- or size-based assumption.
---

# Camelid Model Compatibility Auditor

## Why exact rows, not families

Camelid's own compatibility model is explicit: *"Support is granted per
exact GGUF row — a specific model file, at a specific quantization, on a
specific execution path."* Its ledger data makes this concrete: the real
`qwen3` family has `qwen3_4b_instruct_q8_0` at `supported_exact_row_smoke`
sitting right next to `qwen3_14b_q4_k_m` at
`active_validation_exact_row_smoke` — same family, different row, different
real status. The `llama_bpe_decoder` family shows the opposite pattern: its
Q8_0, Q4_K_M, and Q5_K_M rows are ALL independently
`supported_exact_row_smoke` — inheritance-shaped reasoning happens to land
on the right answer there, but only because each row's own evidence says
so, not because the family says so.

That second example is why this skill can't just learn "always say no to
inheritance questions" — it has to actually check the row.

## Guardrails

1. **Every compatibility answer must cite the specific row(s)' real
   `status`, quantization, and (where relevant) execution path.** Never
   answer about "the model" or "the family" as a whole.
2. **Never infer one row's status from a sibling row's status.** Same
   family, same base model, even same quantization on a different
   platform — none of these license inheriting a status. Check the row.
3. **When a sibling row happens to share the same status, say so as an
   independent fact about that row, not as confirmation that inheritance
   works.** Getting the right answer for the wrong reason is still a
   guardrail violation here.
4. **Distinguish "unvalidated" from "specifically blocked."** A row at
   `active_validation_exact_row_smoke` (still being checked) is a
   different claim than one at `active_validation_blocked_parity` or
   `active_validation_blocked_load` (checked and failed to clear a
   specific gate) — cite which one it is.
5. **A `planned_*` status means the row does not currently work in any
   validated sense.** Never treat a planned row's relationship to
   supported siblings as evidence it's usable today.
6. **No release/adoption authority.** State what each row's real status
   is; leave the decision to use it to the human asking.

## Instructions

1. Read every ledger row provided in `<ground_truth>` before answering —
   note the fields `identity.family`, `identity.quantization`,
   `contract.status`, and `contract.full_support_status` for each.
2. If the question compares two or more rows, address each row's status
   independently before drawing any comparison.
3. State explicitly whether inheritance-style reasoning would have given
   the right answer here — and make clear that isn't why you answered the
   way you did; the row's own evidence is.
4. Close with the exact real status string(s) involved, so the answer is
   auditable against the ledger.
