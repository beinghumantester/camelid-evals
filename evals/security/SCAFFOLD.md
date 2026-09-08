# Security-boundary evals — scaffold only

## Why this isn't wired into `npm run evals`

`mock-server/server.ts` implements Camelid's *chat-completion and
embeddings* surface, not its GitHub provider-auth fetch path or its
workspace session/auth machinery — those live in `src/api/web_research.rs`
and `src/api/mod.rs`'s workspace module, which are separate subsystems
with their own request shapes, tokens, and listener-binding behavior. There
is nothing to point a security probe at without a live instance that has
these subsystems actually running and reachable, and a real (or
deliberately test-scoped) GitHub token to exercise the auth-scope logic
against. Faking the scope-matching logic in a mock would just be
re-implementing `github_auth_scope_for_request()` a second time and
testing that copy against itself.

## What would need to be true to graduate this

1. A live Camelid instance with the web-research/GitHub-fetch path enabled
   and a real (test-scoped, least-privilege) GitHub token configured.
2. A live Camelid instance with `web_workspace` enabled, reachable, so the
   `allow_writes=true` rejection and non-loopback-listener denial can be
   exercised against the real HTTP surface rather than assumed from
   source.
3. A grader that constructs the owner/repo/path-shape/Accept-header
   matrix described in `SKILL.md` and inspects whether the upstream
   GitHub request actually carried a token (this likely requires either a
   GitHub-side request log, or an interception point between Camelid and
   GitHub — a mitmproxy-style setup — since Camelid itself doesn't expose
   "was a token attached" as a response field).

## Case shape

See `cases.schema.json` and `cases.example.json`. Once graduated, this
domain needs a new `scripts/lib/security-probe.ts` and an entry in
`run-harness.ts`'s domain list, mirroring the existing pattern.
