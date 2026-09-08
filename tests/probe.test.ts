// Unit tests for scripts/lib/probe.ts against a synthetic HTTP backend (tests/test-server.ts) —
// no live/mock Camelid instance and no ANTHROPIC_API_KEY needed. Covers the three
// gradeSelfConformanceCase expect.kind variants (including the "neither" / should-FAIL-not-throw
// case), and gradeRegressionMuseumCase's streamed-vs-non-streamed bytewise diff across both the
// characterization and regression_guard roles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServerHandle } from "./test-server.js";
import { gradeSelfConformanceCase, gradeRegressionMuseumCase, gradeEnvironmentIntegrityCase } from "../scripts/lib/probe.js";
import type { EnvironmentIntegrityCase, ModelProfile, RegressionMuseumCase, SelfConformanceCase } from "../scripts/lib/types.js";

async function withServer(handler: Parameters<typeof startTestServer>[0], fn: (server: TestServerHandle) => Promise<void>) {
  const server = await startTestServer(handler);
  const original = process.env.CAMELID_BASE_URL;
  process.env.CAMELID_BASE_URL = server.url;
  try {
    await fn(server);
  } finally {
    if (original === undefined) delete process.env.CAMELID_BASE_URL;
    else process.env.CAMELID_BASE_URL = original;
    await server.close();
  }
}

const confirmedEvidence = { confirmedAtVersion: "v0.6.1", evidenceReference: "test fixture", registryEntryPresentAtVersion: true };

test("gradeSelfConformanceCase: expect.kind='success' PASSes on a matching status", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 1,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "success", status: 200 },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "PASS");
    },
  );
});

test("gradeSelfConformanceCase: expect.kind='typed_error' PASSes when the real ErrorEnvelope shape and fields match", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad", type: "invalid_request", code: "invalid_sampling_parameter", param: "temperature" } }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 2,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "typed_error", status: 400, errorType: "invalid_request", errorCode: "invalid_sampling_parameter" },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "PASS");
    },
  );
});

test("gradeSelfConformanceCase: expect.kind='typed_error' FAILs (not throws) when the body is untyped instead", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to deserialize the JSON body into the target type: top_k" }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 3,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "typed_error", status: 400, errorType: "invalid_request" },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "FAIL");
      assert.ok(result.reasons.some((r) => /ErrorEnvelope shape/.test(r)));
    },
  );
});

test("gradeSelfConformanceCase: expect.kind='untyped_400' PASSes on a genuine deserialization-rejection body", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to deserialize the JSON body into the target type: top_k: invalid value" }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 4,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "untyped_400" },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "PASS");
    },
  );
});

test("gradeSelfConformanceCase: expect.kind='untyped_400' FAILs when the typed ErrorEnvelope shape shows up instead (the real quirk did not reproduce)", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "m", type: "invalid_request", code: "invalid_sampling_parameter", param: "top_k" } }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 5,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "untyped_400" },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "FAIL");
    },
  );
});

test("gradeSelfConformanceCase: a response matching NEITHER the expected status nor shape FAILs cleanly instead of throwing", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "oops", type: "server_error", code: "internal", param: null } }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 6,
        registryId: "x",
        description: "d",
        evidence: confirmedEvidence,
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "success", status: 200 },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "FAIL");
      assert.equal(result.reasons.length, 1);
    },
  );
});

test("gradeSelfConformanceCase: evidence.confirmedAtVersion='UNVERIFIED' always returns UNVERIFIED, even on an otherwise-passing response", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    async () => {
      const c: SelfConformanceCase = {
        id: 7,
        registryId: "x",
        description: "d",
        evidence: { confirmedAtVersion: "UNVERIFIED", evidenceReference: "not isolated yet", registryEntryPresentAtVersion: false },
        request: { method: "POST", path: "/anything", body: {} },
        expect: { kind: "success", status: 200 },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "UNVERIFIED");
    },
  );
});

test("gradeSelfConformanceCase: a requiredCapability the active profile lacks returns BLOCKED without ever calling the server", async () => {
  let serverWasHit = false;
  await withServer(
    (req, res) => {
      serverWasHit = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    },
    async () => {
      // fixtures/model-profiles.json's default active profile (tinyllama-1.1b-q8) has embeddings:false.
      const c: SelfConformanceCase = {
        id: 13,
        registryId: "openai_embeddings",
        description: "d",
        evidence: confirmedEvidence,
        requiredCapability: "embeddings",
        request: { method: "POST", path: "/v1/embeddings", body: {} },
        expect: { kind: "success", status: 200 },
      };
      const result = await gradeSelfConformanceCase(c);
      assert.equal(result.verdict, "BLOCKED");
      assert.ok(result.nonExecutionReason);
    },
  );
  assert.equal(serverWasHit, false, "a BLOCKED case must short-circuit before making any request");
});

function regressionCase(overrides: Partial<RegressionMuseumCase> = {}): RegressionMuseumCase {
  return {
    id: 1,
    bugId: "stop-sequence-streaming-duplication",
    sourceCommit: "2a893b37",
    fixedAtOrAfterVersion: "0.8.0",
    role: "characterization",
    description: "d",
    request: { model: "mock-model", messages: [{ role: "user", content: "hi" }], stop: ["><"], max_tokens: 2 },
    expectedNonStreamText: "<unk",
    expectedStreamedTextBeforeFix: "<unk><unk",
    expectedStreamedTextAfterFix: "<unk",
    ...overrides,
  };
}

function chatServerHandler(nonStreamText: string, streamedDeltas: string[]) {
  return (req: any, res: any, body: string) => {
    const payload = JSON.parse(body || "{}");
    if (payload.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const delta of streamedDeltas) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: nonStreamText } }] }));
    }
  };
}

test("gradeRegressionMuseumCase: characterization role reports KNOWN_DEFECT when the exact buggy duplicated text reproduces on an unfixed version", async () => {
  await withServer(chatServerHandler("<unk", ["<unk>", "<unk"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "characterization" }), "0.6.1");
    assert.equal(result.verdict, "KNOWN_DEFECT");
  });
});

test("gradeRegressionMuseumCase: characterization role FAILs if the streamed text neither matches the buggy nor the fixed text (a NEW, different defect)", async () => {
  await withServer(chatServerHandler("<unk", ["something", "else"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "characterization" }), "0.6.1");
    assert.equal(result.verdict, "FAIL");
  });
});

test("gradeRegressionMuseumCase: regression_guard role is NOT_APPLICABLE when the running version predates the fix", async () => {
  await withServer(chatServerHandler("<unk", ["<unk>", "<unk"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "regression_guard", fixedAtOrAfterVersion: "0.8.0" }), "0.6.1");
    assert.equal(result.verdict, "NOT_APPLICABLE");
    assert.ok(result.nonExecutionReason);
  });
});

test("gradeRegressionMuseumCase: regression_guard role PASSes once the running version has the fix and the streaming duplication is gone", async () => {
  await withServer(chatServerHandler("<unk", ["", "<unk"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "regression_guard", fixedAtOrAfterVersion: "0.6.1" }), "0.6.1");
    assert.equal(result.verdict, "PASS");
  });
});

test("gradeRegressionMuseumCase: regression_guard role FAILs if the fix version still reproduces the duplication (a real regression)", async () => {
  await withServer(chatServerHandler("<unk", ["<unk>", "<unk"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "regression_guard", fixedAtOrAfterVersion: "0.6.1" }), "0.6.1");
    assert.equal(result.verdict, "FAIL");
  });
});

test("gradeRegressionMuseumCase: drift in the non-streaming lane is flagged even when the streamed lane matches — a different defect than the named bug", async () => {
  await withServer(chatServerHandler("something-else-entirely", ["<unk>", "<unk"]), async () => {
    const result = await gradeRegressionMuseumCase(regressionCase({ role: "characterization" }), "0.6.1");
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.reasons.some((r) => /NEW, different defect/.test(r)));
  });
});

function testProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: "tinyllama-1.1b-q8",
    ledgerRowId: "tinyllama_1_1b_chat_q8_0",
    backend: "cpu",
    expectedVersion: "0.6.1",
    capabilities: { chat: true, tools: false, embeddings: false, vision: false },
    ...overrides,
  };
}

test("gradeEnvironmentIntegrityCase: version_matches PASSes when /v1/health agrees with the profile", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: "0.6.1" }));
    },
    async () => {
      const c: EnvironmentIntegrityCase = { id: "EI-1", description: "d", check: "version_matches", evidence: confirmedEvidence };
      const result = await gradeEnvironmentIntegrityCase(c, testProfile());
      assert.equal(result.verdict, "PASS");
    },
  );
});

test("gradeEnvironmentIntegrityCase: version_matches FAILs on a version mismatch, with a reason that names both versions", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: "0.7.0" }));
    },
    async () => {
      const c: EnvironmentIntegrityCase = { id: "EI-1", description: "d", check: "version_matches", evidence: confirmedEvidence };
      const result = await gradeEnvironmentIntegrityCase(c, testProfile());
      assert.equal(result.verdict, "FAIL");
      assert.ok(result.reasons[0].includes("0.6.1") && result.reasons[0].includes("0.7.0"));
    },
  );
});

test("gradeEnvironmentIntegrityCase: no_gpu_backend_active FAILs if a CPU profile's /v1/health reports a GPU backend active", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ q8_runtime: { metal: false, cuda: true } }));
    },
    async () => {
      const c: EnvironmentIntegrityCase = { id: "EI-5", description: "d", check: "no_gpu_backend_active", evidence: confirmedEvidence };
      const result = await gradeEnvironmentIntegrityCase(c, testProfile({ backend: "cpu" }));
      assert.equal(result.verdict, "FAIL");
    },
  );
});
