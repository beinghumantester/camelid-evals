---
name: camelid-eval-discipline
description: The evaluation discipline every camelid-evals skill follows before making a support/correctness judgment about the Camelid local inference engine. Read this before using any of the skills/ subdirectories.
---

# Camelid Evaluation Discipline

## Why this exists

Camelid is not one thing to test — it is an inference engine, a model
compatibility ledger, an OpenAI-compatible API server, a coding agent, a
local RAG system, and a hardware-acceleration layer, all under one claim
boundary. Its own `support_policy` states it plainly: *"A model, tokenizer,
quantization, API feature, or context length is supported only after
tests, docs, and real-model evidence exist for that lane."* And its
`unsupported_policy`: *"Unsupported combinations should return typed
errors instead of silently falling back to best-effort behavior."*

That means the single most important question any eval in this repo can
ask is not "does it work?" — it's **"is this claim actually backed by
evidence, at the exact row/route/mode granularity Camelid itself uses?"**
Treating "it runs" as equivalent to "it's supported" is the single most
common mistake an evaluator can make here, and Camelid's own ledger
distinguishes them explicitly (`generation_runs` vs `status` are separate
fields for a reason).

## The discipline

Before any skill in `skills/` renders a judgment, it follows these steps:

1. Identify the exact capability being evaluated — never "the API" or "the
   agent," but a specific route+mode, or a specific model+quantization+
   execution-path row.
2. Find the authoritative claim for that exact thing — the real
   `api_conformance` registry entry, or the real ledger row's `contract`
   block. Never infer a claim from a neighboring row or a family name.
3. Locate real evidence for that exact claim (a ledger field, a captured
   probe result, a live HTTP response) — never fabricate it.
4. Classify what the evidence actually shows, using Camelid's OWN
   vocabulary (its real `status`/`support_scope`/`full_support_status`
   enums, its real `error.type`/`error.code` values) — never invent a
   parallel vocabulary that sounds similar.
5. Never let a broad-sounding claim ("Qwen3 is supported") stand in for an
   exact-row claim ("Qwen3 4B Instruct Q8_0 is
   `supported_exact_row_smoke`; Qwen3 14B Q4_K_M is
   `active_validation_exact_row_smoke`, a different row entirely").
6. Separate "the implementation exists" from "it runs" from "it's
   validated" from "it's supported" — these are different rungs, and
   evidence for one is not evidence for the next.
7. When evidence is insufficient to answer, say so explicitly. Insufficient
   evidence is a valid, common answer — never round it up to "probably
   fine" or down to "definitely broken."
8. Report uncertainty as uncertainty. A confident-sounding wrong answer is
   worse than an honest "the ledger doesn't say."
9. Never penalize Camelid for a capability the current environment or
   loaded model cannot exercise, and never upgrade an untested capability
   to a passing status just because Camelid's own documentation says it
   exists. These are the two governing rules behind the status vocabulary
   below — every eval in this repo answers to both of them.

## The status vocabulary

Every grader in this repo reports one of exactly seven verdicts
(`scripts/lib/types.ts`'s `GradeVerdict`) — never a bare pass/fail:

| Status | Meaning |
|---|---|
| `PASS` | Expected behavior observed |
| `FAIL` | Applicable test produced unexpected behavior |
| `KNOWN_DEFECT` | Failure is already known and expected for this pinned version (see the regression-museum KB-1/KB-2 split) |
| `NOT_APPLICABLE` | The environment cannot exercise the capability at all (missing hardware — e.g. GPU-only checks on a CPU-only laptop) |
| `BLOCKED` | The capability could be tested in principle, but the required model/config/credential isn't currently loaded (e.g. an embeddings case when a chat-only model is active) |
| `UNVERIFIED` | Not enough evidence yet exists to assert an oracle either way — the case runs, but its result can't be trusted until the citation is finished |
| `ERROR` | The evaluation infrastructure itself failed — never counted as a Camelid defect |

Only `FAIL` and `ERROR` should ever fail a CI run. `NOT_APPLICABLE`,
`BLOCKED`, and `UNVERIFIED` are Camelid-agnostic outcomes that get their
own `nonExecutionReason` explaining why — a bare skip with no reason is
never acceptable (rule #9 above, made mechanical).

## Environment integrity and model profiles

Every oracle in this repo is grounded against one specific pinned Camelid
version, running one specific model, on one specific machine — not
Camelid in general. `evals/environment-integrity/` (`camelid-environment-
integrity` skill) runs FIRST in `run-harness.ts` and checks that the
reachable instance actually matches the profile it's meant to: right
version, right active model, right backend, no GPU where none should be
active. A failure there means every other result in the same run should
be read as `UNVERIFIED`, not trusted at face value — see that skill's
`SKILL.md` for detail.

`fixtures/model-profiles.json` (`docs/MODEL_PROFILES.md`) declares what
each of the five real, on-disk models this laptop can load is actually
capable of (chat/tools/embeddings/vision), so a case whose
`requiredCapability` the active profile lacks is reported `BLOCKED`
rather than silently run against the wrong model or silently dropped.

## Process rules — grading HOW, not just WHAT

Some cases carry a `process_rules` array (`ProcessRule` in
`scripts/lib/types.ts`, graded by the pure-code
`scripts/lib/process-rules.ts`, independent of whatever the semantic/
behavioral verdict was) — procedural constraints like "the tool must be
called before any text is emitted" or "this field must never be set to an
invented status string." A skill can reach the right conclusion for the
wrong reason (a lucky parametric guess instead of an actual tool call,
say); `process_rules` catches that mechanically rather than relying on the
semantic judge to notice.

## What this repo actually contains

Two kinds of skills live in `skills/`, and the difference matters:

- **Functional** (`camelid-environment-integrity`, `camelid-self-conformance`,
  `camelid-regression-museum`, `camelid-evidence-audit`,
  `camelid-model-compatibility`): real,
  executable evals with a real grader — either pure code against a live
  or mock HTTP endpoint, or an LLM judge scoring a real skill run against
  real ledger/contract data. `npm run evals` actually runs these.
- **Scaffold-only** (`camelid-agent-testing`, `camelid-security-testing`,
  `camelid-rag-testing`, `camelid-multimodal-testing`,
  `camelid-hardware-parity`): the evaluation discipline and eval-case shape
  are written out, grounded in real contract text where Camelid documents
  the relevant boundary (e.g. the real `web_workspace` contract for
  security/RAG evals), but there is no live agent, sandboxed filesystem, or
  second GPU backend reachable from here to actually run them against.
  Running fabricated checks against a fake sandbox would validate the fake,
  not Camelid — so these stay unexecuted until a real Camelid agent
  instance is reachable. See each skill's SKILL.md for exactly what would
  need to be true to graduate it to functional.

Read the top-level `README.md` for the full functional/scaffold map with
source citations for every claim.
