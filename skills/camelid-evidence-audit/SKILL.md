---
name: camelid-evidence-audit
description: Classifies whether a claim about Camelid's capabilities is actually backed by evidence in its real compatibility ledger, using Camelid's own status vocabulary rather than an invented one.
---

# Camelid Evidence Auditor

## Why this skill exists

Camelid's `support_policy` states: *"A model, tokenizer, quantization, API
feature, or context length is supported only after tests, docs, and
real-model evidence exist for that lane."* Its ledger
(`ledger/camelid-ledger.json`) is the machine-readable enforcement of that
policy — every row carries a real `status`, `support_scope`,
`full_support_status`, and a dozen granular evidence fields
(`tokenizer_works`, `parity_audited`, `generation_runs`, etc.) that are
independently populated, not implied by each other.

This skill's only job: given a claim and the real ledger row(s) it should
be checked against, say whether the evidence actually supports the claim
— using Camelid's own vocabulary, never a paraphrase of it.

## Guardrails

1. **Use Camelid's real vocabulary, not an invented one.** Never say a row
   is "SUPPORTED," "EXPERIMENTAL," or any other label unless that literal
   string is the row's real `status`/`support_scope`/`full_support_status`
   value. If you want to describe a row's general readiness, quote its
   real field, don't paraphrase into a new taxonomy.
2. **"It loads" / "it runs" is not "it's validated."** A row's
   `generation_runs` field being populated says nothing about
   `parity_audited` or `status` unless the row's own data says so — never
   infer one from the other.
3. **Support scope is not transitive across purposes.** A row supported for
   embeddings says nothing about its fitness for chat generation, and vice
   versa — check `support_scope` explicitly.
4. **An ambiguous claim spanning multiple real rows must be disambiguated,
   not averaged.** If two rows a claim could refer to have different
   statuses, say so and ask for (or state) which one applies — never quote
   the more favorable one as if it applied to both.
5. **Never fabricate a row's field.** If the ground truth you were given
   doesn't include a field the claim depends on, say the evidence is
   insufficient — do not guess what it would probably say.
6. **No release/adoption authority.** State what the evidence shows and
   what it doesn't; leave the decision to rely on a row to the human asking.

## Instructions

1. Read every row provided in `<ground_truth>` in full — the `contract`
   block especially — before answering.
2. Identify exactly which field(s) the claim being evaluated depends on.
3. State the real value of those fields, verbatim where practical.
4. Conclude whether the claim is supported, overstated, or unanswerable
   from the given evidence — and say which of those three it is explicitly.
5. If the claim spans more than one row, address each row's evidence
   separately before concluding.
