// Shared types across all functional domains.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  seed?: number;
  stop?: string[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
}

export interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Real shape, from src/api/mod.rs's ErrorEnvelope/ErrorBody. */
export interface ErrorEnvelope {
  error: { message: string; type: string; code: string; param: string | null };
  prompt_token_count?: number;
}

export interface RawHttpResult<T> {
  status: number;
  body: T | undefined;
  raw: string;
  /** true if the body parsed as JSON matching the real ErrorEnvelope shape (has error.type/error.code) */
  isTypedErrorEnvelope: boolean;
}

// --- process_rules: procedural constraints, graded separately from the conclusion ---

export type ProcessRule =
  | { type: "tool_before_any_text"; tool: string }
  | { type: "field_not_value"; field: string; forbidden_value: string }
  | { type: "step_order"; before: string; after: string };

/** A trace of what a skill run actually did, for process_rules to check against. Distinct
 * from the semantic judge — this is a pure-code assertion, never an LLM opinion. */
export interface ExecutionTrace {
  toolCallsInOrder: string[]; // tool names, in the order they were actually invoked
  textEmittedBeforeFirstToolCall: boolean;
  finalFields: Record<string, string>; // named fields in the skill's final structured output, if any
  checkpointsReached: string[]; // named checkpoints, in order, for step_order rules
}

// --- self-conformance ---

export type SelfConformanceExpectation =
  | { kind: "typed_error"; status: number; errorType: string; errorCode?: string } // errorCode omitted when not independently confirmed against real source
  | { kind: "untyped_400" } // fails JSON deserialization before reaching the typed-error path (real, documented quirk for negative top_k)
  | { kind: "success"; status: number };

/** Where the behavioral oracle is confirmed present, distinct from which contract.rs
 * registry entry (if any) names it — the two can diverge across Camelid versions. See
 * BASELINE_EVAL_PLAN.md's "behavioral oracle vs evidence reference" split. */
export interface VersionedEvidence {
  /** e.g. "v0.6.1" — the exact tag this citation was checked against. */
  confirmedAtVersion: string;
  /** Where the BEHAVIOR is confirmed at that version — a real file/line/test name, not the registry entry. */
  evidenceReference: string;
  /** Whether fixtures/api-conformance-registry.json's registryId below is itself confirmed present at confirmedAtVersion. */
  registryEntryPresentAtVersion: boolean;
}

export interface SelfConformanceCase {
  id: number;
  registryId: string; // which fixtures/api-conformance-registry.json entry this drives (may be HEAD-only, see evidence)
  description: string;
  evidence: VersionedEvidence;
  requiredCapability?: keyof ModelCapabilities; // BLOCKED (not run) if the active profile lacks this
  request: { method: "GET" | "POST"; path: string; body?: unknown };
  expect: SelfConformanceExpectation;
  expectedEmbeddingDimensions?: number; // asserted against response.data[0].embedding.length when present
  process_rules?: ProcessRule[];
}

// --- evidence-audit / model-compatibility (semantic, ledger-grounded) ---

export interface LedgerSemanticCase {
  id: number;
  domain: "evidence-audit" | "model-compatibility";
  description: string;
  prompt: string;
  rowIds: string[]; // real ledger model_rows[].contract.id values to hand the skill as ground truth
  expectations: string[];
  process_rules?: ProcessRule[];
}

// --- regression-museum: split per version, per BASELINE_EVAL_PLAN.md's KB-1/KB-2 design ---

export interface RegressionMuseumCase {
  id: number;
  bugId: string;
  sourceCommit: string;
  /** The tag the fix landed at/after. A target version older than this has the bug by design. */
  fixedAtOrAfterVersion: string;
  description: string;
  request: ChatCompletionRequest;
  /** The bug (2a893b37) affects only the STREAMING lane — the non-streaming response is
   * correct both before and after the fix, so there is exactly one expected non-stream text,
   * not a before/after pair. A regression here (non-stream text drifting) is a NEW, different
   * defect, not this one. */
  expectedNonStreamText: string;
  /** What the streamed reconstruction must be on a version WITHOUT the fix (the
   * historically-observed buggy, duplicated text). */
  expectedStreamedTextBeforeFix: string;
  /** What the streamed reconstruction must be on a version WITH the fix (matches
   * expectedNonStreamText once fixed). */
  expectedStreamedTextAfterFix: string;
  /** "characterization" cases expect the bug and report KNOWN_DEFECT, never FAIL, on an
   * unfixed version. "regression_guard" cases are NOT_APPLICABLE on an unfixed version and
   * only PASS/FAIL once the target version includes the fix. */
  role: "characterization" | "regression_guard";
}

// --- environment integrity: must run first, gates confidence of everything else ---

export interface EnvironmentIntegrityCase {
  id: string; // e.g. "EI-1"
  description: string;
  check: "version_matches" | "active_model_matches_profile" | "backend_matches_profile" | "vision_ready_false" | "no_gpu_backend_active";
  evidence: VersionedEvidence;
}

// --- model profiles: what's loaded gates which cases are even attempted ---

export interface ModelCapabilities {
  chat: boolean;
  tools: boolean;
  embeddings: boolean;
  vision: boolean;
}

export interface ModelProfile {
  id: string; // e.g. "tinyllama-1.1b-q8"
  ledgerRowId: string; // real ledger row id this profile corresponds to
  backend: "cpu" | "metal" | "cuda";
  expectedVersion: string; // the Camelid version this profile was defined against, e.g. "0.6.1"
  capabilities: ModelCapabilities;
}

// --- generic grading ---

export type EvalDomain =
  | "environment-integrity"
  | "self-conformance"
  | "regression-museum"
  | "evidence-audit"
  | "model-compatibility";

/** The full status vocabulary agreed in BASELINE_EVAL_PLAN.md. PASS/FAIL are real verdicts;
 * everything else explains why a verdict couldn't be reached, and none of them count as a
 * Camelid failure. */
export type GradeVerdict =
  | "PASS"
  | "FAIL"
  | "KNOWN_DEFECT" // failure is already known and expected for the pinned version under test
  | "NOT_APPLICABLE" // environment cannot exercise the capability at all (missing hardware)
  | "BLOCKED" // capability could be tested in principle, but required model/config/credential isn't loaded
  | "UNVERIFIED" // not enough evidence yet to assert an oracle
  | "ERROR"; // the evaluation infrastructure itself failed, not Camelid

export interface GradeResult {
  id: number | string;
  domain: EvalDomain;
  verdict: GradeVerdict;
  reasons: string[];
  /** Populated whenever verdict is NOT_APPLICABLE or BLOCKED, per BASELINE_EVAL_PLAN.md
   * principle #10 — a bare SKIPPED/NOT_APPLICABLE with no reason is not auditable. */
  nonExecutionReason?: string;
}
