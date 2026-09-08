# Agent-loop evals — scaffold only

## Why this isn't wired into `npm run evals`

`scripts/run-harness.ts` only knows about
`self-conformance | regression-museum | evidence-audit |
model-compatibility`. This domain is intentionally absent.

The reason isn't laziness — it's the historical bug this domain exists to
guard against. Commit `a6b660cf` in `timtoole02/Camelid` (real, verified in
the cloned source) fixed the live-model agent loop firing **zero** tool
calls for any tool-capable model, and its own commit message explains why
unit tests missed it: mock/canned drivers never exercised the code path
that broke. A mock server (like `mock-server/server.ts` in this repo) that
returns a hand-crafted `tool_calls` field would reproduce exactly that
blind spot — it would prove the harness can parse a well-formed mock
response, not that Camelid correctly parses a real model's template
output. Building this domain against a mock would validate the mock, not
Camelid.

## What would need to be true to graduate this

1. A real, running Camelid instance with `web_workspace` enabled, reachable
   from wherever the harness runs (not just `127.0.0.1:8181` used for the
   chat-completion mock — this needs the actual agent session endpoints:
   `POST /api/agent/workspace/sessions`, `GET
   /api/agent/workspace/threads`, etc., per `src/api/mod.rs`).
2. At least one loaded model row with `tool_capable: true` (check the real
   ledger row, don't assume).
3. A grader that inspects the *raw* HTTP response shape — specifically
   whether `content` came back empty with a populated `tool_calls` array
   (the exact shape the `a6b660cf` fix introduced support for) — rather
   than just checking whether a tool "seemed to" execute.
4. A real read-only file to point `read_file`/`list_dir` at inside the
   workspace root, so a genuine tool round-trip can be observed end to
   end.

## Case shape

See `cases.schema.json` for the proposed shape and `cases.example.json`
for one worked (but NOT executed, NOT loaded by the harness) example.

Once a live agent is reachable, this domain should get its own
`gradeAgentCase()` in a new `scripts/lib/agent-probe.ts`, mirroring the
pattern in `scripts/lib/probe.ts`, and be added to
`run-harness.ts`'s `EvalDomain` union and `parseDomains()` allow-list.
