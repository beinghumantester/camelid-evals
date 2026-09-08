// Unit tests for scripts/lib/process-rules.ts — pure code, zero dependency on a live/mock
// Camelid instance or ANTHROPIC_API_KEY. Run with: npm test (tsx --test tests/**/*.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeProcessRules } from "../scripts/lib/process-rules.js";
import type { ExecutionTrace, ProcessRule } from "../scripts/lib/types.js";

function baseTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    toolCallsInOrder: [],
    textEmittedBeforeFirstToolCall: false,
    finalFields: {},
    checkpointsReached: [],
    ...overrides,
  };
}

test("no rules → no violations, regardless of trace", () => {
  const violations = gradeProcessRules(undefined, baseTrace());
  assert.deepEqual(violations, []);
  assert.deepEqual(gradeProcessRules([], baseTrace()), []);
});

test("tool_before_any_text: passes when the tool was called and no text preceded it", () => {
  const rules: ProcessRule[] = [{ type: "tool_before_any_text", tool: "check_ledger" }];
  const trace = baseTrace({ toolCallsInOrder: ["check_ledger"], textEmittedBeforeFirstToolCall: false });
  assert.deepEqual(gradeProcessRules(rules, trace), []);
});

test("tool_before_any_text: fails when the required tool was never called", () => {
  const rules: ProcessRule[] = [{ type: "tool_before_any_text", tool: "check_ledger" }];
  const trace = baseTrace({ toolCallsInOrder: [], textEmittedBeforeFirstToolCall: false });
  const violations = gradeProcessRules(rules, trace);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /never called/);
});

test("tool_before_any_text: fails when text was emitted before the tool call — the ordering violation, not just presence/absence", () => {
  const rules: ProcessRule[] = [{ type: "tool_before_any_text", tool: "check_ledger" }];
  // The tool WAS called (so a naive "was it called at all" check would pass this),
  // but text came first — the conclusion may be right by coincidence, not by evidence.
  const trace = baseTrace({ toolCallsInOrder: ["check_ledger"], textEmittedBeforeFirstToolCall: true });
  const violations = gradeProcessRules(rules, trace);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /emitted before/);
});

test("field_not_value: passes when the field is absent or set to an allowed value", () => {
  const rules: ProcessRule[] = [{ type: "field_not_value", field: "status", forbidden_value: "SUPPORTED" }];
  assert.deepEqual(gradeProcessRules(rules, baseTrace({ finalFields: {} })), []);
  assert.deepEqual(gradeProcessRules(rules, baseTrace({ finalFields: { status: "active_validation_exact_row_smoke" } })), []);
});

test("field_not_value: fails when the field is set to the forbidden value", () => {
  const rules: ProcessRule[] = [{ type: "field_not_value", field: "status", forbidden_value: "SUPPORTED" }];
  const violations = gradeProcessRules(rules, baseTrace({ finalFields: { status: "SUPPORTED" } }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /forbidden value 'SUPPORTED'/);
});

test("step_order: passes when 'after' is reached strictly before 'before' in the trace", () => {
  const rules: ProcessRule[] = [{ type: "step_order", before: "final_answer", after: "ledger_checked" }];
  const trace = baseTrace({ checkpointsReached: ["ledger_checked", "final_answer"] });
  assert.deepEqual(gradeProcessRules(rules, trace), []);
});

test("step_order: fails when the order is reversed", () => {
  const rules: ProcessRule[] = [{ type: "step_order", before: "final_answer", after: "ledger_checked" }];
  const trace = baseTrace({ checkpointsReached: ["final_answer", "ledger_checked"] });
  const violations = gradeProcessRules(rules, trace);
  assert.equal(violations.length, 1);
});

test("step_order: fails when either checkpoint never happened", () => {
  const rules: ProcessRule[] = [{ type: "step_order", before: "final_answer", after: "ledger_checked" }];
  assert.equal(gradeProcessRules(rules, baseTrace({ checkpointsReached: ["final_answer"] })).length, 1);
  assert.equal(gradeProcessRules(rules, baseTrace({ checkpointsReached: [] })).length, 1);
});

test("multiple rules accumulate independent violations rather than short-circuiting on the first", () => {
  const rules: ProcessRule[] = [
    { type: "tool_before_any_text", tool: "check_ledger" },
    { type: "field_not_value", field: "status", forbidden_value: "SUPPORTED" },
  ];
  const trace = baseTrace({ toolCallsInOrder: [], finalFields: { status: "SUPPORTED" } });
  assert.equal(gradeProcessRules(rules, trace).length, 2);
});
