---
name: camelid-regression-museum
description: Replays real, historically-verified Camelid bugs (mined from actual fix commits) against a live instance to confirm they stay fixed, rather than testing against invented failure scenarios — and stays honest about which pinned version should still show the bug.
---

# Camelid Regression Museum

## Why real bugs, not invented ones

An eval built around an imagined failure mode tests whether the
evaluator's imagination matches reality — which it usually doesn't. An
eval built around a bug that actually happened, with an exact documented
repro and a commit that fixed it, tests something real: has this specific
defect, or the class of defect it represents, come back.

Both cases in `evals/regression-museum/cases.json` reproduce commit
`2a893b37` exactly: a stop sequence (`"><"`, `max_tokens: 2`) whose match
straddles a token boundary, which made Camelid's dense streaming lane
resend the whole reply as a duplicate delta (non-streaming was always
correct — this bug is streaming-only).

## The KB-1 / KB-2 split — why there are two cases for one bug

Git archaeology on the real repository found something load-bearing:
`2a893b37` (the fix) postdates **both** `v0.6.1` (this project's pinned
laptop version) **and** the newer `v0.7.0` tag — confirmed via
`git merge-base --is-ancestor v0.7.0 2a893b37`. As of this writing the fix
exists only on `main`/HEAD, in no tagged release. A single case asserting
"the correct text" would be simply wrong for every version anyone is
actually running today, and a single case asserting "the buggy text" would
turn into a false FAIL the moment the fix ships.

So this bug is split into two cases with different roles
(`RegressionMuseumCase.role` in `scripts/lib/types.ts`):

- **KB-1 (`"characterization"`, case id 1)** — expects the bug on any
  version that predates the fix. Reports `KNOWN_DEFECT`, never `FAIL`,
  when the historically-observed duplicated text (`"<unk><unk"`)
  reproduces exactly. A `FAIL` here means something has changed and it no
  longer matches even the *known*, expected defect shape — which is worth
  flagging as a possibly NEW, different problem.
- **KB-2 (`"regression_guard"`, case id 2)** — is `NOT_APPLICABLE` for
  every version before the fix ships (there's nothing to guard yet), and
  only starts actually running, expecting `"<unk"` with no duplication,
  once the running version is at or after `fixedAtOrAfterVersion`.

`fixedAtOrAfterVersion` is currently the honest sentinel
`"unreleased-post-v0.7.0"` rather than a fabricated version number.
**When the fix actually ships in a tagged release, update that one field
to the real tag** — KB-2 will then start running for real, and this is
the only edit needed to graduate it.

## Guardrails

1. **Cite the source commit for every entry**, and confirm (don't assume)
   which tagged releases include it, the same way KB-1/KB-2's split was
   derived from `git merge-base --is-ancestor`, not guesswork.
2. **A `FAIL` on KB-1 or KB-2 means the historical bug reappeared** (or
   changed shape) — report it as exactly that, with the commit reference,
   not as a vague "streaming inconsistency."
3. **`NOT_APPLICABLE` on KB-2 is not a skip to explain away.** It is the
   correct, honest outcome for an unreleased fix — never delete the case
   or treat a `NOT_APPLICABLE` run as suspicious.
4. **Do not fabricate additional "known bugs."** Only `2a893b37` has been
   independently verified against the real repository as part of building
   this project. Other candidates (e.g. the "agent tool-calling loop fired
   zero tools" fix, `a6b660cf`) are real commits but were not reproduced
   here because they need live tool execution, not just the
   chat-completion endpoint — see `skills/camelid-agent-testing/SKILL.md`
   for why that one is scaffold-only for now. Adding a new museum entry
   means finding a real commit with a reproducible HTTP-level trigger and
   doing the same tag-boundary archaeology, not inferring one.
5. **No release/upgrade authority.** Report whether the historical defect
   reappeared, or whether the guard now applies; leave the decision to fix
   or ship to a human engineer.

## Instructions

1. Determine the running version (`GET /v1/health`'s `version`, falling
   back to the active `ModelProfile.expectedVersion` if unreachable) —
   this decides which role's branch applies, per `gradeRegressionMuseumCase`
   in `scripts/lib/probe.ts`.
2. For each case, send the exact `request` both streaming and
   non-streaming.
3. Reconstruct the streamed text from SSE deltas exactly as a real client
   would (concatenate `choices[0].delta.content` in order).
4. Compare the non-streaming reconstruction against `expectedNonStreamText`
   always (this lane is unaffected by the fix — any drift here is a NEW
   defect, not this one). Compare the streamed reconstruction against
   `expectedStreamedTextBeforeFix` or `expectedStreamedTextAfterFix`,
   whichever matches whether the running version has the fix.
5. Either mismatch is a finding — cite which lane diverged and quote the
   actual text observed alongside the expected text.
