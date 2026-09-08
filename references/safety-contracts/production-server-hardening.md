# Safety contract: `production-server-hardening`

**Source:** `config/runtime-capabilities.json` at the real
`timtoole02/Camelid` `v0.6.1` tag, transcribed verbatim into
`fixtures/runtime-capabilities.json` (project id `production-server-hardening`,
project number 8).

**Used by:** `evals/security/SCAFFOLD.md`'s `workspace_write_denial` /
`workspace_loopback_only` boundaries, `skills/camelid-security-testing/SKILL.md`.

## Real fields (verbatim from the fixture)

```json
{
  "id": "production-server-hardening",
  "project": 8,
  "status": "implemented",
  "default_enabled": true,
  "configuration": [
    "CAMELID_API_KEY", "CAMELID_API_KEY_FILE", "CAMELID_CORS_ORIGINS",
    "CAMELID_ALLOW_UNAUTHENTICATED_REMOTE", "CAMELID_TLS_CERT", "CAMELID_TLS_KEY",
    "CAMELID_MAX_REQUEST_BODY_BYTES", "CAMELID_MAX_PROMPT_TOKENS",
    "CAMELID_MAX_GENERATION_TOKENS", "CAMELID_MAX_DOWNLOAD_BYTES"
  ],
  "dependencies": ["runtime-capability-registry"],
  "evidence": [
    "api::server::tests::remote_listener_requires_auth_or_explicit_override",
    "api::server::tests::router_authenticates_api_routes_but_keeps_health_public",
    "api::server::tests::cors_emits_only_explicitly_allowed_origin",
    "api::server::tests::tls_files_and_resource_limits_fail_closed_when_incomplete",
    "api::server::tests::request_body_ceiling_returns_payload_too_large",
    "api::download_cancel_tests::finished_download_above_ceiling_is_never_promoted",
    "api::metrics::tests::exposition_is_prometheus_text_and_has_no_model_or_secret_labels"
  ],
  "safety_contract": "Loopback stays frictionless. Non-loopback binds require authentication unless an explicit unsafe override is set; CORS is exact-origin only, secrets are redacted, TLS inputs are paired, and request/token/download ceilings are enforced."
}
```

## What this means for evaluation

This is Camelid's own self-declared, machine-readable safety boundary —
not an inferred or assumed one. Every clause in `safety_contract` maps to
a named test in `evidence`:

- **"Loopback stays frictionless"** / **"Non-loopback binds require
  authentication unless an explicit unsafe override is set"** →
  `remote_listener_requires_auth_or_explicit_override`. This is the real
  boundary behind `evals/security/cases.example.json`'s
  `workspace_loopback_only` boundary type — a request to bind on a
  non-loopback address without `CAMELID_ALLOW_UNAUTHENTICATED_REMOTE` set
  must be rejected.
- **"CORS is exact-origin only"** → `cors_emits_only_explicitly_allowed_origin`.
- **"secrets are redacted"** → `exposition_is_prometheus_text_and_has_no_model_or_secret_labels`
  (Prometheus metrics endpoint must never leak `CAMELID_API_KEY` or model
  paths).
- **"TLS inputs are paired"** → `tls_files_and_resource_limits_fail_closed_when_incomplete`
  (a lone `CAMELID_TLS_CERT` without `CAMELID_TLS_KEY`, or vice versa,
  must fail closed rather than serve plaintext).
- **"request/token/download ceilings are enforced"** →
  `request_body_ceiling_returns_payload_too_large` and
  `finished_download_above_ceiling_is_never_promoted`.

## Why this is scaffold-only in this project

Grading any of these clauses live requires either binding Camelid on a
non-loopback address (this laptop's evaluator runs everything through
`127.0.0.1`, by design, so it never exercises the non-loopback path) or a
network setup that can attempt cross-origin requests and inspect response
headers — neither of which `mock-server/server.ts`'s single-process,
loopback-only HTTP server can honestly simulate without re-implementing
the boundary logic being tested. See `evals/security/SCAFFOLD.md` for the
case shape and graduation criteria.
