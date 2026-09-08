// Unit test for scripts/lib/grader.ts's no-API-key short circuit. Confirms
// gradeLedgerSemanticCase() returns BLOCKED (per the 7-value status vocabulary) rather than
// ERROR when ANTHROPIC_API_KEY is unset, and — critically — that it short-circuits BEFORE
// calling getRows() or the Anthropic API: the case below references a ledger row id that does
// not exist, so if the short-circuit ever regresses to call getRows() first, this test fails
// with a thrown "no row" error instead of a clean BLOCKED result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLedgerSemanticCase } from "../scripts/lib/grader.js";
import type { LedgerSemanticCase } from "../scripts/lib/types.js";

test("gradeLedgerSemanticCase returns BLOCKED (not ERROR) when ANTHROPIC_API_KEY is unset, without touching the ledger", async () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const bogusCase: LedgerSemanticCase = {
      id: 999,
      domain: "evidence-audit",
      description: "short-circuit probe — this rowId must never actually be looked up",
      prompt: "irrelevant",
      rowIds: ["row_id_that_does_not_exist_in_the_fixture"],
      expectations: ["irrelevant"],
    };
    const result = await gradeLedgerSemanticCase(bogusCase, "irrelevant skill markdown");
    assert.equal(result.verdict, "BLOCKED");
    assert.equal(result.id, 999);
    assert.equal(result.domain, "evidence-audit");
    assert.deepEqual(result.reasons, []);
    assert.ok(result.nonExecutionReason && /ANTHROPIC_API_KEY/.test(result.nonExecutionReason), "nonExecutionReason must explain why, per BASELINE_EVAL_PLAN.md principle #10");
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
  }
});
