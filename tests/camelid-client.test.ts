// Unit tests for scripts/lib/camelid-client.ts's isTypedErrorEnvelope() — the exact
// distinction self-conformance case SC-4 (top_k < 0 → untyped 400, not the typed
// ErrorEnvelope) depends on. Zero network/dependency: pure shape classification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTypedErrorEnvelope } from "../scripts/lib/camelid-client.js";

test("real ErrorEnvelope shape ({error:{message,type,code,param}}) classifies as typed", () => {
  assert.equal(
    isTypedErrorEnvelope({ error: { message: "temperature must be finite and >= 0", type: "invalid_request", code: "invalid_sampling_parameter", param: "temperature" } }),
    true,
  );
});

test("typed envelope with param: null still classifies as typed (param is nullable, not required truthy)", () => {
  assert.equal(isTypedErrorEnvelope({ error: { message: "m", type: "not_implemented", code: "not_implemented", param: null } }), true);
});

test("a bare axum/serde deserialization-rejection body (string error, no nested object) classifies as untyped", () => {
  assert.equal(isTypedErrorEnvelope({ error: "Failed to deserialize the JSON body into the target type: top_k: invalid value" }), false);
});

test("an error object missing 'type' or 'code' classifies as untyped, not typed", () => {
  assert.equal(isTypedErrorEnvelope({ error: { message: "m", type: "invalid_request" } }), false); // missing code
  assert.equal(isTypedErrorEnvelope({ error: { message: "m", code: "invalid_sampling_parameter" } }), false); // missing type
});

test("undefined, null, and non-object bodies all classify as untyped rather than throwing", () => {
  assert.equal(isTypedErrorEnvelope(undefined), false);
  assert.equal(isTypedErrorEnvelope(null), false);
  assert.equal(isTypedErrorEnvelope("plain string body"), false);
  assert.equal(isTypedErrorEnvelope(42), false);
});

test("a success body (no 'error' key at all) classifies as untyped", () => {
  assert.equal(isTypedErrorEnvelope({ id: "mock-1", choices: [] }), false);
});
