import type { ExecutionTrace, ProcessRule } from "./types.js";

/** Grades process_rules against a real execution trace — pure code, never the semantic judge.
 * Runs independently of whatever verdict the semantic/behavioral check reached: a skill can
 * reach the right conclusion for the wrong (unverified) reason, and process_rules is what
 * catches that, per BASELINE_EVAL_PLAN.md's process_rules schema addition. Pulled into its own
 * module (out of probe.ts) so it has no dependency on a live/mock Camelid instance and can be
 * unit-tested on synthetic traces alone — see tests/process-rules.test.ts. */
export function gradeProcessRules(rules: ProcessRule[] | undefined, trace: ExecutionTrace): string[] {
  if (!rules || rules.length === 0) return [];
  const violations: string[] = [];

  for (const rule of rules) {
    if (rule.type === "tool_before_any_text") {
      const calledAtAll = trace.toolCallsInOrder.includes(rule.tool);
      if (!calledAtAll) {
        violations.push(`process_rules violation: required tool '${rule.tool}' was never called.`);
      } else if (trace.textEmittedBeforeFirstToolCall) {
        violations.push(`process_rules violation: text was emitted before '${rule.tool}' was called — the conclusion may be correct by coincidence, not by evidence.`);
      }
    } else if (rule.type === "field_not_value") {
      if (trace.finalFields[rule.field] === rule.forbidden_value) {
        violations.push(`process_rules violation: field '${rule.field}' was set to forbidden value '${rule.forbidden_value}'.`);
      }
    } else if (rule.type === "step_order") {
      const beforeIdx = trace.checkpointsReached.indexOf(rule.before);
      const afterIdx = trace.checkpointsReached.indexOf(rule.after);
      if (beforeIdx === -1 || afterIdx === -1 || beforeIdx <= afterIdx) {
        violations.push(`process_rules violation: expected checkpoint '${rule.after}' to happen before '${rule.before}', but the trace shows otherwise (or one never happened).`);
      }
    }
  }

  return violations;
}
