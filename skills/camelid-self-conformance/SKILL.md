---
name: camelid-self-conformance
description: Audits whether a live Camelid instance's actual HTTP behavior matches the API contract Camelid itself declares (its real api_conformance registry and typed error envelope), rather than testing it against external assumptions.
---

# Camelid Self-Conformance Auditor

## Why this is different from testing against an external spec

Every prior attempt at "does the API work right" either assumes the API
looks like a generic OpenAI-compatible server, or invents plausible-sounding
validation rules. Camelid doesn't need either — it ships its own machine-
readable contract: `src/api/contract.rs`'s `API_CONFORMANCE_CASES` registry
is served verbatim through `/api/capabilities` as `api_conformance`, and its
`ErrorEnvelope`/`ErrorBody` structs define an exact, typed error shape with
a real status→`error.type` mapping (500→server_error, 501→not_implemented,
503→runtime_unavailable, 422→model_unavailable, everything else→
invalid_request).

So this skill's job is narrow and precise: for a curated set of entries in
that real registry, drive the actual documented route/mode boundary and
confirm live behavior matches the declared `supported_modes` /
`unsupported_modes` — using Camelid's own vocabulary, never an invented one.

## Guardrails

1. **Never assert a code you haven't independently confirmed.** Every eval
   case in `evals/self-conformance/cases.json` either cites the exact
   confirmed `error.code` (e.g. `invalid_sampling_parameter`, confirmed via
   `config.validate()` in `src/api/mod.rs`), or asserts only `status` +
   `error.type` and says so explicitly in its description. Do not upgrade
   an unconfirmed guess into an assertion.
2. **A 400 is not automatically the typed ErrorEnvelope.** A negative
   `top_k` fails Rust's serde deserialization of an unsigned field before
   the handler runs at all — it returns a 400, but not the typed shape.
   Treating every 400 as interchangeable is the exact mistake this skill
   exists to catch.
3. **Never generalize a route-level finding to the whole API.** A finding
   about `/v1/chat/completions` sampling validation says nothing about
   `/v1/embeddings` sampling validation (embeddings don't take those
   parameters at all) — cite the exact route and registry id every time.
4. **A `not_implemented` response is success, not failure, for the fail-
   closed routes.** `/infill`, `/v1/messages`, `/models/unload`, `/slots`
   are DECLARED unsupported; a live 501 with `error.type=not_implemented`
   on those routes is Camelid behaving exactly as documented. Silently
   returning 200 on one of those routes would be the actual regression.
5. **No release/upgrade authority.** Report conformance and drift; leave
   the decision to fix or ship to a human engineer.
6. **`registryId` names a contract.rs entry; `evidence` names where the
   BEHAVIOR was confirmed — the two can diverge across versions, and
   several cases here are exactly that divergence.** Several
   `sampling_*` registry ids are HEAD-only additions to `contract.rs`
   (not present at the pinned `v0.6.1` tag), but the underlying validation
   and error code were already live at `v0.6.1` — each such case's
   `evidence.evidenceReference` cites the real `src/api/mod.rs` line/test
   that proves the behavior, independent of whether the named registry
   entry existed yet. Never treat `registryEntryPresentAtVersion: false`
   as disqualifying a case — the citation is just pointed somewhere more
   precise than the registry.
7. **`evidence.confirmedAtVersion: "UNVERIFIED"` cases run and report
   `UNVERIFIED`, not `PASS`/`FAIL`**, regardless of what the live response
   looks like — an unconfirmed oracle can't honestly grade a real result
   either way.
8. **`requiredCapability` gates execution, not scoring.** A case with
   `requiredCapability: "embeddings"` against a chat-only active profile
   is `BLOCKED`, never silently skipped or force-run against the wrong
   model.

## Instructions

1. Load `fixtures/api-conformance-registry.json` (the real, transcribed
   registry) and `evals/self-conformance/cases.json` (which cases drive
   which registry entries, and why).
2. For each case, first check `requiredCapability` against the active
   `ModelProfile` (`fixtures/model-profiles.json`) — report `BLOCKED` and
   stop if it's unmet.
3. Send the exact request and compare the live response against its
   `expect` block — `typed_error` (status + error.type + optionally
   error.code), `untyped_400` (a 400 that is NOT the ErrorEnvelope shape),
   or `success`. If `expectedEmbeddingDimensions` is set, also assert it
   against `response.data[0].embedding.length` — this is confirmed from a
   real parsed GGUF header, not a guess.
4. If `evidence.confirmedAtVersion === "UNVERIFIED"`, report `UNVERIFIED`
   regardless of what the response showed.
5. Report failures grouped by registry id, citing the route and the exact
   mismatch (status, error.type, error.code, or shape).
6. Never editorialize about whether an unconfirmed error code "should" be
   something — if it isn't confirmed, say so and stop there.
