#!/usr/bin/env tsx
// The eval harness across all FUNCTIONAL domains: environment-integrity (preflight),
// self-conformance, regression-museum (all pure code, no LLM), evidence-audit and
// model-compatibility (both LLM-judged against real ledger data). Scaffold domains
// (agent/security/rag/multimodal/hardware-parity) are not wired in here at all — see
// evals/<domain>/SCAFFOLD.md for why.
//
// Usage:
//   tsx scripts/run-harness.ts --domain all
//   tsx scripts/run-harness.ts --domain self-conformance,regression-museum
//   tsx scripts/run-harness.ts --domain evidence-audit,model-compatibility
//   CAMELID_MODEL_PROFILE=nomic-embed-v1.5-q8 tsx scripts/run-harness.ts --domain self-conformance

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EnvironmentIntegrityCase,
  EvalDomain,
  GradeResult,
  LedgerSemanticCase,
  RegressionMuseumCase,
  SelfConformanceCase,
} from "./lib/types.js";
import { gradeSelfConformanceCase, gradeRegressionMuseumCase, gradeEnvironmentIntegrityCase } from "./lib/probe.js";
import { gradeLedgerSemanticCase } from "./lib/grader.js";
import { hasApiKey } from "./lib/anthropic-client.js";
import { baseUrl, getHealth } from "./lib/camelid-client.js";
import { getActiveProfile } from "./lib/profiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function parseDomains(): Set<EvalDomain> {
  const arg = process.argv.find((a) => a.startsWith("--domain"));
  const value = arg?.includes("=") ? arg.split("=")[1] : process.argv[process.argv.indexOf("--domain") + 1];
  const all: EvalDomain[] = ["environment-integrity", "self-conformance", "regression-museum", "evidence-audit", "model-compatibility"];
  if (!value || value === "all") return new Set(all);
  return new Set(value.split(",").map((d) => d.trim()) as EvalDomain[]);
}

async function main() {
  const domains = parseDomains();
  const results: GradeResult[] = [];
  const profile = getActiveProfile();

  console.log(`Camelid base URL: ${baseUrl()}`);
  console.log(`Active model profile: ${profile.id} (ledger row: ${profile.ledgerRowId}, backend: ${profile.backend})\n`);

  // Environment integrity runs first and its result is reported, but per
  // BASELINE_EVAL_PLAN.md principle #12 a failure here should make a human downgrade
  // confidence in everything below — the harness doesn't hide other results, it just warns.
  let environmentIsSuspect = false;
  if (domains.has("environment-integrity")) {
    const { cases } = JSON.parse(readFileSync(join(ROOT, "evals", "environment-integrity", "cases.json"), "utf8")) as { cases: EnvironmentIntegrityCase[] };
    for (const c of cases) {
      try {
        const result = await gradeEnvironmentIntegrityCase(c, profile);
        results.push(result);
        if (result.verdict !== "PASS") environmentIsSuspect = true;
      } catch (err) {
        results.push({ id: c.id, domain: "environment-integrity", verdict: "ERROR", reasons: [(err as Error).message] });
        environmentIsSuspect = true;
      }
    }
    if (environmentIsSuspect) {
      console.warn("⚠  environment-integrity did not fully PASS — every other result below should be treated as UNVERIFIED, not trusted at face value, until this is resolved.\n");
    }
  }

  if (domains.has("self-conformance")) {
    const { cases } = JSON.parse(readFileSync(join(ROOT, "evals", "self-conformance", "cases.json"), "utf8")) as { cases: SelfConformanceCase[] };
    for (const c of cases) {
      try {
        results.push(await gradeSelfConformanceCase(c));
      } catch (err) {
        results.push({ id: c.id, domain: "self-conformance", verdict: "ERROR", reasons: [(err as Error).message] });
      }
    }
  }

  if (domains.has("regression-museum")) {
    const health = await getHealth().catch(() => ({}) as any);
    const runningVersion = health.version ?? profile.expectedVersion;
    const { cases } = JSON.parse(readFileSync(join(ROOT, "evals", "regression-museum", "cases.json"), "utf8")) as { cases: RegressionMuseumCase[] };
    for (const c of cases) {
      try {
        results.push(await gradeRegressionMuseumCase(c, runningVersion));
      } catch (err) {
        results.push({ id: c.id, domain: "regression-museum", verdict: "ERROR", reasons: [(err as Error).message] });
      }
    }
  }

  const semanticDomains = (["evidence-audit", "model-compatibility"] as const).filter((d) => domains.has(d));
  if (semanticDomains.length > 0 && !hasApiKey()) {
    console.warn("⚠  ANTHROPIC_API_KEY is not set — evidence-audit / model-compatibility cases will be reported as BLOCKED, not run.\n");
  }
  for (const domain of semanticDomains) {
    const skillMd = readFileSync(join(ROOT, "skills", domain === "evidence-audit" ? "camelid-evidence-audit" : "camelid-model-compatibility", "SKILL.md"), "utf8");
    const { cases } = JSON.parse(readFileSync(join(ROOT, "evals", domain, "cases.json"), "utf8")) as { cases: LedgerSemanticCase[] };
    for (const c of cases) {
      try {
        results.push(await gradeLedgerSemanticCase(c, skillMd));
      } catch (err) {
        results.push({ id: c.id, domain, verdict: "ERROR", reasons: [(err as Error).message] });
      }
    }
  }

  const icons: Record<string, string> = {
    PASS: "✓",
    FAIL: "✗",
    KNOWN_DEFECT: "⚠",
    NOT_APPLICABLE: "○",
    BLOCKED: "─",
    UNVERIFIED: "?",
    ERROR: "!",
  };
  for (const result of results) {
    const icon = icons[result.verdict] ?? "?";
    console.log(`[${icon}] ${result.domain}#${result.id} ${result.verdict}`);
    for (const reason of result.reasons) console.log(`      ${reason}`);
    if (result.nonExecutionReason) console.log(`      ${result.nonExecutionReason}`);
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.verdict === "PASS").length,
    fail: results.filter((r) => r.verdict === "FAIL").length,
    known_defect: results.filter((r) => r.verdict === "KNOWN_DEFECT").length,
    not_applicable: results.filter((r) => r.verdict === "NOT_APPLICABLE").length,
    blocked: results.filter((r) => r.verdict === "BLOCKED").length,
    unverified: results.filter((r) => r.verdict === "UNVERIFIED").length,
    error: results.filter((r) => r.verdict === "ERROR").length,
  };
  console.log(
    `\nSummary: ${summary.pass} passed, ${summary.fail} failed, ${summary.known_defect} known-defect, ${summary.not_applicable} not-applicable, ${summary.blocked} blocked, ${summary.unverified} unverified, ${summary.error} errored (of ${summary.total})`,
  );

  const runsDir = join(ROOT, "runs");
  mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(runsDir, `${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify({ baseUrl: baseUrl(), profile: profile.id, domains: [...domains], summary, results }, null, 2));
  console.log(`Report written to ${reportPath.replace(ROOT + "/", "")}`);

  // FAIL and ERROR are the only outcomes that should break CI. KNOWN_DEFECT,
  // NOT_APPLICABLE, BLOCKED, and UNVERIFIED are all "not a Camelid failure right now."
  if (summary.fail > 0 || summary.error > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
