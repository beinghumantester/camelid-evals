---
name: camelid-agent-testing
description: SCAFFOLD ONLY — the evaluation discipline for Camelid's tool-calling agent loop (web_workspace sessions and function_tool_roundtrip), not yet wired to an executable grader. Read evals/agent/SCAFFOLD.md before treating this as runnable.
---

# Camelid Agent-Loop Auditor (scaffold only)

## Status

**This skill is not executable.** There is no `npm run evals` path that
invokes it, and it is deliberately absent from
`scripts/run-harness.ts`'s domain list. It exists to record the
evaluation discipline and case shape now, grounded in real, verified
Camelid source, so that whoever next has a live Camelid agent reachable
can graduate it to a real grader without re-deriving any of this from
scratch. See `evals/agent/SCAFFOLD.md` for exactly what "graduating" it
requires.

## Why this is real, not speculative

Two independently verifiable facts anchor this skill:

1. **A real, fixed bug**: commit `a6b660cf` in `timtoole02/Camelid`
   ("fix(agent): consume the server's structured tool_calls (loop fired
   zero tools)") documents that Camelid's live-model agent driver used to
   read only `message.content` for tool calls. But when `tools` are
   supplied, the server parses the call into the structured OpenAI
   `tool_calls` field and **empties `content`** — so the agent saw empty
   text, found no calls, and silently answered nothing, for *every* model
   whose chat template renders tool calls (Llama 3.x and others). The
   commit message states this bug was invisible to unit tests because
   only mock/canned drivers exercised the execution path — only a real
   model against a real endpoint reproduces it. That is exactly why this
   skill can't be scaffolded as "executable with a mock": a mock chat
   endpoint that returns the fix's own structured `tool_calls` field would
   only prove the mock is well-behaved, not that a real model's template
   output is parsed correctly.
2. **A real, narrow contract**: the `web_workspace` conformance case
   (`fixtures/api-conformance-registry.json`) states the *only* supported
   modes are `read_only_tools` and `durable_threads`, over exactly
   `read_file`/`list_dir`/literal-content search inside one canonical
   workspace root, with `allow_writes=true` explicitly rejected. It also
   documents specific real constraints this skill must check for, not
   invent: a turn-scoped cancellation, a 90-second model-step deadline,
   model-transition exclusion, and generation available "only to
   supported exact rows with `tool_capable=true`." The contract explicitly
   disclaims "no write, shell, network, GUI, subagent, unattended,
   neighboring-model, persistent vector database, broad
   retrieval-quality, portability, or throughput claim" — any eval case
   asserting one of those behaviors exists would itself be wrong.

## Guardrails (to carry forward when this graduates to executable)

1. **Never grade the agent loop against a mock chat endpoint's own
   `tool_calls` field as if that proves real-model parsing works.** The
   `a6b660cf` bug was specifically invisible to that shape of test. A real
   grader must drive an actual tool-capable model.
2. **Every case must cite the specific model row it ran against** (its
   `identity.id` from the ledger) and that row's `tool_capable` field —
   never a generic "the agent."
3. **Distinguish "the model emitted zero tool calls" from "the model
   emitted a tool call the harness failed to execute"** — these are
   different failure classes with different real root causes; don't
   collapse them into one verdict.
4. **Never assert write, shell, network, subagent, or unattended
   behavior succeeded.** Per the real contract these are rejected outright
   (`allow_writes=true` is rejected); a case expecting one of these to
   work is testing a capability Camelid doesn't claim.
5. **Respect the documented deadlines and exclusions as real constraints,
   not implementation details to work around.** A case that times out at
   the 90-second model-step deadline is exercising documented behavior,
   not discovering a bug — grade it as such.
6. **No release/deploy authority.** State what the agent loop actually did
   against the exact row tested; leave the decision to rely on it to the
   human asking.

## Instructions (for the future executable version)

1. Confirm a live Camelid instance with `web_workspace` enabled is
   reachable, and confirm which exact model row is loaded and whether its
   `tool_capable` field is true — never assume.
2. Open a real `/api/agent/workspace/sessions` session and drive it with a
   real read-only-tool task (e.g. "list the files in this workspace and
   read one").
3. Capture the raw response shape actually returned — specifically whether
   `content` was emptied and `tool_calls` populated, per the `a6b660cf`
   fix — before concluding whether tools executed.
4. Grade only against the exact documented supported modes; treat any
   unsupported-mode request (write, shell, network, subagent) that
   correctly fails as a PASS, not a gap.
5. Cite the exact model row, session outcome, and which documented
   constraint (if any) was exercised, so the result is auditable.
