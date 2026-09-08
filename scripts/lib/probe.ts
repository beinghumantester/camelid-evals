import * as client from "./camelid-client.js";
import { blockedByProfile } from "./profiles.js";
import type {
  EnvironmentIntegrityCase,
  GradeResult,
  ModelProfile,
  RegressionMuseumCase,
  SelfConformanceCase,
} from "./types.js";

export { gradeProcessRules } from "./process-rules.js";

/** Drives one self-conformance case against the live/mock engine and checks the outcome against what Camelid's own contract declares. No LLM involved. */
export async function gradeSelfConformanceCase(c: SelfConformanceCase): Promise<GradeResult> {
  if (c.requiredCapability) {
    const blockedReason = blockedByProfile(c.requiredCapability);
    if (blockedReason) {
      return { id: c.id, domain: "self-conformance", verdict: "BLOCKED", reasons: [], nonExecutionReason: blockedReason };
    }
  }

  const result = await client.postJson<any>(c.request.path, c.request.body ?? {});
  const reasons: string[] = [];

  if (c.expect.kind === "success") {
    if (result.status !== c.expect.status) {
      reasons.push(`Expected HTTP ${c.expect.status}, got ${result.status}. Raw: ${result.raw.slice(0, 200)}`);
    }
  } else if (c.expect.kind === "typed_error") {
    if (result.status !== c.expect.status) {
      reasons.push(`Expected HTTP ${c.expect.status}, got ${result.status}.`);
    }
    if (!result.isTypedErrorEnvelope) {
      reasons.push(`Expected the real ErrorEnvelope shape ({error:{message,type,code,param}}), got: ${result.raw.slice(0, 200)}`);
    } else {
      const body = result.body as any;
      if (body.error.type !== c.expect.errorType) {
        reasons.push(`Expected error.type='${c.expect.errorType}', got '${body.error.type}'.`);
      }
      if (c.expect.errorCode && body.error.code !== c.expect.errorCode) {
        reasons.push(`Expected error.code='${c.expect.errorCode}', got '${body.error.code}'.`);
      }
    }
  } else {
    // untyped_400: must be a 400 that does NOT match the typed ErrorEnvelope shape.
    if (result.status !== 400) {
      reasons.push(`Expected HTTP 400 (untyped JSON-deserialization rejection), got ${result.status}.`);
    }
    if (result.isTypedErrorEnvelope) {
      reasons.push(`Expected an untyped deserialization-rejection body, but got the typed ErrorEnvelope shape instead — the real deserialization-layer quirk did not reproduce.`);
    }
  }

  if (c.expectedEmbeddingDimensions !== undefined && result.status === 200) {
    const dims = (result.body as any)?.data?.[0]?.embedding?.length;
    if (dims !== c.expectedEmbeddingDimensions) {
      reasons.push(`Expected embedding dimension ${c.expectedEmbeddingDimensions} (confirmed from the real GGUF header), got ${dims}.`);
    }
  }

  if (c.evidence.confirmedAtVersion === "UNVERIFIED") {
    return {
      id: c.id,
      domain: "self-conformance",
      verdict: "UNVERIFIED",
      reasons: [`Behavioral oracle not yet confirmed against a specific v0.6.1 source location — see BASELINE_EVAL_PLAN.md open items before trusting this case's result either way.`],
    };
  }

  return { id: c.id, domain: "self-conformance", verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** Reproduces (or fails to reproduce) the exact historical bug from a regression-museum case,
 * grading against whichever text is correct for the ACTUAL running version — not a single
 * fixed expectation — per the KB-1/KB-2 split in BASELINE_EVAL_PLAN.md. */
export async function gradeRegressionMuseumCase(c: RegressionMuseumCase, runningVersion: string): Promise<GradeResult> {
  const reasons: string[] = [];
  const versionHasFix = compareVersions(runningVersion, c.fixedAtOrAfterVersion) >= 0;

  if (c.role === "regression_guard" && !versionHasFix) {
    return {
      id: c.id,
      domain: "regression-museum",
      verdict: "NOT_APPLICABLE",
      reasons: [],
      nonExecutionReason: `The fix for ${c.bugId} (${c.sourceCommit}) lands at/after ${c.fixedAtOrAfterVersion}; the running version ${runningVersion} predates it, so there is nothing to regression-guard yet. This case activates once you're on ${c.fixedAtOrAfterVersion} or later.`,
    };
  }

  const [nonStream, streamed] = await Promise.all([
    client.chatCompletion(c.request),
    client.chatCompletionStream(c.request),
  ]);

  const nonStreamText = nonStream.body?.choices?.[0]?.message?.content;
  // The bug is streaming-only: the non-streaming lane is correct both before and after the
  // fix, so it always compares against the single expectedNonStreamText, regardless of
  // versionHasFix. Only the streamed reconstruction's expectation flips on the fix.
  const expectedStreamedText = versionHasFix ? c.expectedStreamedTextAfterFix : c.expectedStreamedTextBeforeFix;

  if (typeof nonStreamText !== "string") {
    reasons.push(`Non-streaming response content is not a string (HTTP ${nonStream.status}).`);
  } else if (nonStreamText !== c.expectedNonStreamText) {
    reasons.push(`Non-streaming text '${nonStreamText}' does not match the expected reference text '${c.expectedNonStreamText}' — this lane is unaffected by the fix, so any drift here is a NEW, different defect, not ${c.bugId}.`);
  }

  if (streamed.text !== expectedStreamedText) {
    reasons.push(
      `Streamed reconstruction '${streamed.text}' does not match the expected text '${expectedStreamedText}' for a version that ${versionHasFix ? "has" : "predates"} the fix (non-streaming gave '${nonStreamText}').`,
    );
  }

  const clean = reasons.length === 0;
  if (!versionHasFix) {
    // role === "characterization" here (regression_guard already returned above).
    return {
      id: c.id,
      domain: "regression-museum",
      verdict: clean ? "KNOWN_DEFECT" : "FAIL",
      reasons: clean
        ? [`KNOWN DEFECT — expected for ${runningVersion} (predates the ${c.sourceCommit} fix landing at ${c.fixedAtOrAfterVersion}); not counted as a regression.`]
        : [...reasons, `Also unexpected: even the KNOWN_DEFECT characterization did not match the historically-observed buggy text — this may be a NEW, different defect.`],
    };
  }

  return { id: c.id, domain: "regression-museum", verdict: clean ? "PASS" : "FAIL", reasons };
}

/** Environment-integrity preflight (EI-1..EI-5 in BASELINE_EVAL_PLAN.md). Must run before
 * anything else is trusted — a wrong environment downgrades every other result. */
export async function gradeEnvironmentIntegrityCase(c: EnvironmentIntegrityCase, profile: ModelProfile): Promise<GradeResult> {
  const health = await client.getHealth();
  const reasons: string[] = [];

  switch (c.check) {
    case "version_matches":
      if (health.version !== profile.expectedVersion) {
        reasons.push(`Expected version '${profile.expectedVersion}', /v1/health reported '${health.version}'. Downgrade every other result to UNVERIFIED until this is resolved.`);
      }
      break;
    case "active_model_matches_profile":
      if (health.active_model_id !== profile.ledgerRowId && health.active_model_id !== undefined) {
        reasons.push(`Expected active model '${profile.ledgerRowId}', /v1/health reported '${health.active_model_id}'.`);
      }
      break;
    case "backend_matches_profile":
      if (health.backend !== "llama" && profile.backend === "cpu") {
        reasons.push(`Expected backend 'llama' for a CPU llama-family profile, got '${health.backend}'.`);
      }
      break;
    case "vision_ready_false":
      if (health.vision_ready !== false && !profile.capabilities.vision) {
        reasons.push(`Profile declares vision=false but /v1/health reports vision_ready=${health.vision_ready}.`);
      }
      break;
    case "no_gpu_backend_active":
      if (profile.backend === "cpu" && (health.q8_runtime?.metal || health.q8_runtime?.cuda)) {
        reasons.push(`Profile declares CPU-only but /v1/health's q8_runtime reports a GPU backend active.`);
      }
      break;
  }

  return { id: c.id, domain: "environment-integrity", verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** Simple semver-ish comparator sufficient for "vX.Y.Z" tags. Returns <0, 0, >0. */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
