---
name: camelid-security-testing
description: SCAFFOLD ONLY — the evaluation discipline for Camelid's real auth/scope boundaries (GitHub provider-auth scoping, workspace write/shell/network denial, the workspace CLI bearer token), not yet wired to an executable grader.
---

# Camelid Security-Boundary Auditor (scaffold only)

## Status

**This skill is not executable.** It is absent from
`scripts/run-harness.ts`'s domain list. It records the real, verified
security boundaries Camelid documents in source, so a future grader with
a live instance and real credentials to test against doesn't have to
re-derive them. See `evals/security/SCAFFOLD.md` for what graduating this
requires.

## Why this is real, not speculative

This skill is grounded in two independently verified boundaries in the
cloned source, not in a generic "test for security issues" instinct:

1. **Scoped GitHub provider-auth, verified in `src/api/web_research.rs`**:
   Camelid's web-research fetch path does not attach a GitHub token to
   just any request. `github_auth_scope_for_request()` requires `https`,
   host exactly `api.github.com`, and the URL path segments and `Accept`
   header to match one of exactly two allowed shapes:
   `GithubRepositoryMetadata` → `["repos", owner, repo]` with
   `application/vnd.github+json`, or `GithubVerifiedPublicApi` →
   `["repos", owner, repo, "git", "trees", sha, ...]` or
   `["repos", owner, repo, "readme"]` with the matching `Accept` header.
   `github_token_for_request()` then only releases the token if the
   *computed* scope for this exact request matches the *stored* scope —
   an owner/repo mismatch, a wrong `Accept` header, or a path shape one
   segment off silently gets no token, not an error. This is a real,
   narrow, request-shape-based authorization check, and it's exactly the
   kind of boundary a naive eval would either not think to test at the
   segment/header level, or would incorrectly assume is a simple
   allowlist-by-domain check.
2. **Workspace's explicit denial list and CLI bearer token, verified in
   `src/api/mod.rs` and the real `web_workspace` conformance case**: the
   contract states `allow_writes=true` is rejected outright, and the
   surface excludes shell, network, GUI, subagent, and unattended
   operation entirely — not "supported but risky," but not implemented as
   a code path at all. Separately, `workspace_cli_token` is described in
   source as "Process-rotated bearer capability for same-user Workspace
   CLI clients" — a token that rotates per process, not a static secret —
   and Workspace itself "is disabled when [the listener address] is
   non-loopback," i.e. it refuses to serve non-local traffic at all.

## Guardrails (to carry forward when this graduates to executable)

1. **Test the exact scope-matching logic, not a coarse "was a token
   sent" check.** A case must vary one dimension at a time (owner, repo,
   path shape, `Accept` header) and confirm the token is withheld when any
   one of them doesn't match — matching Camelid's own
   `github_auth_scope_for_request` logic exactly, never a paraphrase of it.
2. **Never claim a write, shell, network, subagent, or unattended
   operation succeeded.** These are absent code paths per the real
   contract, not permissions to probe for a bypass of — a case expecting
   one to "almost work" is testing something that doesn't exist.
3. **Test the loopback-only listener boundary as a real claim, not an
   assumption.** If workspace is reachable from a non-loopback address at
   all, that is itself the finding — don't just test what happens after
   connecting.
4. **Never fabricate a credential or scope value.** If a case needs a
   specific token or scope shape, cite where it came from (a real
   generated CLI token, a real request), never a plausible-looking
   placeholder presented as evidence.
5. **Prompt injection findings must cite the untrusted-content boundary
   Camelid itself declares** — e.g. the `web_workspace` contract's own
   language that injected source excerpts are "explicitly untrusted" —
   rather than inventing a generic injection taxonomy unconnected to how
   Camelid actually marks trust.
6. **No release/deploy authority.** State what boundary was tested and
   what the real request/response showed; leave any hardening decision to
   the human asking.

## Instructions (for the future executable version)

1. Confirm a live Camelid instance is reachable and identify which
   security-relevant surface is being tested (GitHub provider-auth scoping
   vs. workspace write/shell/network denial vs. the CLI bearer token) —
   never test all three as if they were one boundary.
2. For provider-auth scoping: construct a small matrix of requests that
   vary exactly one of {owner, repo, path shape, Accept header} from a
   known-valid case, and confirm the token is withheld for each mismatch.
3. For workspace denial: attempt a documented-as-rejected operation
   (`allow_writes=true`, a non-loopback connection) and confirm it is
   rejected via a typed error, not silently ignored or partially honored.
4. Cite the exact request shape sent and the exact response received for
   every case, so the result is auditable against the real source logic.
