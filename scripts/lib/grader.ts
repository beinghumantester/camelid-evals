import type { GradeResult, LedgerSemanticCase } from "./types.js";
import { hasApiKey, judgeWithVoting, runSkill } from "./anthropic-client.js";
import { getRows } from "./ledger.js";

/** Runs an evidence-audit or model-compatibility case: real skill run over real ledger rows, then LLM-judged. */
export async function gradeLedgerSemanticCase(c: LedgerSemanticCase, skillMd: string): Promise<GradeResult> {
  if (!hasApiKey()) {
    return {
      id: c.id,
      domain: c.domain,
      verdict: "BLOCKED",
      reasons: [],
      nonExecutionReason: "BLOCKED — reason: ANTHROPIC_API_KEY not set; this domain needs a real model call to judge against. Hardware/version are irrelevant here — only the API key gates it.",
    };
  }
  try {
    const rows = getRows(c.rowIds); // throws if a case references a row not in the fixture — never fabricates
    const answer = await runSkill(skillMd, rows, c.prompt);
    const judged = await judgeWithVoting(c.prompt, answer, c.expectations);
    return { id: c.id, domain: c.domain, verdict: judged.verdict, reasons: judged.verdict === "FAIL" ? judged.reasons : [] };
  } catch (err) {
    return { id: c.id, domain: c.domain, verdict: "ERROR", reasons: [(err as Error).message] };
  }
}
