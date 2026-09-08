---
name: camelid-environment-integrity
description: Confirms, before any other eval runs, that the reachable Camelid instance is actually the pinned version/model/backend this project's oracles were written against — not a different instance that happens to answer on the same port.
---

# Camelid Environment Integrity

## Why this runs first, and what it protects

Every other domain in this project — self-conformance, regression-museum,
evidence-audit, model-compatibility — asserts a specific oracle that was
verified against a specific Camelid version (`v0.6.1`) running a specific
model (TinyLlama 1.1B Chat Q8_0, or one of the other four real profiles in
`fixtures/model-profiles.json`) on a specific machine (an Intel i7-8665U,
CPU-only, no GPU). None of those oracles are universal truths about
Camelid — they are true about *that* combination.

If `CAMELID_BASE_URL` happens to point at a different version, a different
model, or a machine with a GPU backend active, every PASS/FAIL below is a
result about the wrong thing, reported with the same confidence as if it
were right. This skill exists to catch that before it happens, per
BASELINE_EVAL_PLAN.md principle #12: **a wrong environment downgrades
every other result to `UNVERIFIED`, it does not just add one more failing
row.**

## Guardrails

1. **This is a preflight, not a feature test.** Do not add cases here that
   test Camelid behavior — that's every other domain's job. This domain
   only asks "is this the instance I think it is."
2. **A failure here is loud, not quiet.** `run-harness.ts` prints a
   warning banner and the report should be read with every other result
   downgraded, but the harness still runs and reports everything — it
   does not abort, because seeing exactly what a mismatched environment
   produces is itself diagnostic information.
3. **Cite the real `HealthResponse` field for every check**, from
   `src/api/mod.rs`, the same way every other domain cites real source.
   Never assert against a field whose existence and shape you haven't
   independently confirmed at the pinned version.
4. **Never silently "fix" a mismatch by switching profiles.** If
   `active_model_id` doesn't match the profile you expected, that is a
   FAIL to report, not a signal to pick a different profile and retry —
   the loaded model is a fact about the running instance, not a dial the
   evaluator gets to turn.

## Instructions

1. Call `GET /v1/health` once per harness run, before any other domain.
2. Run every case in `evals/environment-integrity/cases.json` against
   that single response (no need to re-fetch per case).
3. Report each case's `check` against the active `ModelProfile`
   (`fixtures/model-profiles.json`, selectable via `CAMELID_MODEL_PROFILE`):
   - `version_matches` — `HealthResponse.version` equals the profile's
     `expectedVersion`.
   - `active_model_matches_profile` — `HealthResponse.active_model_id`
     equals the profile's `ledgerRowId`.
   - `backend_matches_profile` — `HealthResponse.backend` is consistent
     with the profile's declared backend.
   - `vision_ready_false` — a CPU-only, non-vision profile must see
     `vision_ready: false`.
   - `no_gpu_backend_active` — a `"cpu"`-backend profile must see no
     Metal/CUDA flag active in `q8_runtime`.
4. If any case fails, still run the rest of the suite (per guardrail #2),
   but prefix the run's summary with the warning `run-harness.ts` already
   emits, and don't let a downstream PASS be read as confirmation of
   anything beyond "the wrong environment happened to also produce the
   expected bytes."
