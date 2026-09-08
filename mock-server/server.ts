#!/usr/bin/env tsx
// A dependency-free stand-in for a Camelid instance that reproduces REAL,
// verified behavior transcribed from the actual Rust source
// (src/api/mod.rs, src/api/contract.rs) rather than invented behavior:
//   - the real ErrorEnvelope/ErrorBody shape and status->error_type mapping
//   - the real sampling-parameter validation rules (temperature/top_p/top_k/
//     min_p/stop), including the documented quirk that a NEGATIVE top_k
//     fails JSON deserialization (a different, untyped 400) rather than
//     going through the typed invalid_sampling_parameter path
//   - the real fail-closed native routes (/infill, /v1/messages,
//     /models/unload, /slots) returning typed 501 not_implemented
//   - the real /api/capabilities api_conformance registry, served verbatim
//     from fixtures/api-conformance-registry.json
//   - the EXACT historical stop-sequence streaming duplication bug from
//     commit 2a893b37, reproducible via BUG_MODE=stop_straddle
//
// Everything here is provenance-tagged in fixtures/*.json and the project
// README — this mock exists to let the harness be verified without your
// real Camelid instance reachable, not to replace it.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PORT = Number(process.env.MOCK_PORT ?? 8181);
// Default is "stop_straddle", NOT "fixed" — commit 2a893b37 (the real fix) postdates both
// v0.6.1 and v0.7.0 (see docs/V0.6.1_DRIFT_AUDIT.md), and MOCK_HEALTH_VERSION also defaults to
// "0.6.1" below. An unfixed version reproducing the bug by default is the honest simulation;
// set BUG_MODE=fixed explicitly to simulate a future release that actually has the fix.
const BUG_MODE = process.env.BUG_MODE ?? "stop_straddle"; // "fixed" | "stop_straddle"

const conformanceRegistry = JSON.parse(readFileSync(join(ROOT, "fixtures", "api-conformance-registry.json"), "utf8"));

function typedError(status: number, code: string, message: string, param: string | null = null) {
  const errorType =
    status === 500 ? "server_error" : status === 501 ? "not_implemented" : status === 503 ? "runtime_unavailable" : status === 422 ? "model_unavailable" : "invalid_request";
  return { status, body: { error: { message, type: errorType, code, param } } };
}

/** Simulates an Axum/serde JSON deserialization rejection: NOT the typed ErrorEnvelope shape. */
function malformedJson(field: string, detail: string) {
  return { status: 400, body: { error: `Failed to deserialize the JSON body into the target type: ${field}: ${detail}` } };
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function validateSampling(payload: any): { status: number; body: unknown } | null {
  if (payload.temperature !== undefined) {
    if (typeof payload.temperature !== "number" || !Number.isFinite(payload.temperature) || payload.temperature < 0) {
      return typedError(400, "invalid_sampling_parameter", "temperature must be finite and >= 0", "temperature");
    }
  }
  if (payload.top_p !== undefined) {
    if (typeof payload.top_p !== "number" || !Number.isFinite(payload.top_p) || payload.top_p <= 0 || payload.top_p > 1) {
      return typedError(400, "invalid_sampling_parameter", "top_p must be finite and in (0, 1]", "top_p");
    }
  }
  if (payload.top_k !== undefined) {
    if (typeof payload.top_k === "number" && payload.top_k < 0) {
      // Real behavior: top_k is an unsigned field on the wire; a negative
      // value fails JSON deserialization before the handler even runs.
      return malformedJson("top_k", `invalid value: integer \`${payload.top_k}\`, expected u32`);
    }
    if (payload.top_k === 0) {
      return typedError(400, "invalid_sampling_parameter", "top_k of 0 is invalid", "top_k");
    }
  }
  if (payload.min_p !== undefined) {
    if (typeof payload.min_p !== "number" || !Number.isFinite(payload.min_p) || payload.min_p < 0 || payload.min_p > 1) {
      return typedError(400, "invalid_sampling_parameter", "min_p must be finite and in [0, 1]", "min_p");
    }
  }
  if (payload.stop !== undefined) {
    if (!Array.isArray(payload.stop) || payload.stop.length === 0 || payload.stop.length > 4 || payload.stop.some((s: unknown) => typeof s !== "string" || s.length === 0)) {
      return typedError(400, "invalid_sampling_parameter", "stop must be 1-4 non-empty strings", "stop");
    }
  }
  return null;
}

function deterministicReply(lastUserMessage: string): string {
  return `Mock reply to: ${lastUserMessage.trim()}`;
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "";

  // /v1/health — shape per the real HealthResponse struct (src/api/mod.rs, confirmed at
  // v0.6.1). Driven by env vars so a test can simulate either the pinned laptop profile or a
  // deliberately mismatched environment, to prove environment-integrity actually catches drift.
  if (req.method === "GET" && url === "/v1/health") {
    const body = {
      ok: true,
      version: process.env.MOCK_HEALTH_VERSION ?? "0.6.1",
      build: process.env.MOCK_HEALTH_VERSION ?? "0.6.1",
      active_model_id: process.env.MOCK_HEALTH_MODEL ?? "tinyllama_1_1b_chat_q8_0",
      backend: process.env.MOCK_HEALTH_BACKEND ?? "llama",
      vision_ready: process.env.MOCK_HEALTH_VISION_READY === "1",
      q8_runtime: {
        metal: process.env.MOCK_HEALTH_METAL === "1",
        cuda: process.env.MOCK_HEALTH_CUDA === "1",
      },
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === "GET" && url === "/api/capabilities") {
    const body = {
      engine: "camelid-mock",
      gguf_metadata: true,
      tensor_loading: true,
      tokenization: true,
      inference: true,
      streaming: true,
      model_downloads: false,
      hf_catalog_install: false,
      support_contract: {
        current_gate: "mock server — see fixtures/ledger-excerpt.json for real ledger provenance",
        support_policy: "A model, tokenizer, quantization, API feature, or context length is supported only after tests, docs, and real-model evidence exist for that lane.",
        unsupported_policy: "Unsupported combinations should return typed errors instead of silently falling back to best-effort behavior.",
      },
      api_conformance: conformanceRegistry.cases,
      notes: ["This is the mock server; api_conformance is the real registry transcribed from src/api/contract.rs."],
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  // Real fail-closed native compatibility routes (src/api/contract.rs: fail_closed_native_compatibility_routes)
  if (req.method === "POST" && ["/infill", "/v1/messages", "/models/unload", "/slots"].includes(url)) {
    const { status, body } = typedError(501, "not_implemented", `${url} is not implemented`);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === "POST" && (url === "/v1/embeddings" || url === "/embedding" || url === "/embeddings")) {
    const raw = await readBody(req);
    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (payload.encoding_format === "base64") {
      const { status, body } = typedError(400, "unsupported_encoding_format", "base64 encoding_format is not supported");
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    const input = Array.isArray(payload.input) ? payload.input : [payload.input ?? ""];
    // 768 = the real embedding_length parsed from nomic-embed-text-v1.5.Q8_0.gguf's own header
    // on the user's laptop (general.architecture=nomic-bert), not a guess.
    const vectorLen = 768;
    const data = input.map((_: unknown, i: number) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: vectorLen }, (_, j) => Math.round(Math.sin(i + j) * 1000) / 1000),
    }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data, model: payload.model ?? "nomic-embed-text-v1.5" }));
    return;
  }

  if (req.method === "POST" && url === "/v1/chat/completions") {
    const raw = await readBody(req);
    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const invalid = validateSampling(payload);
    if (invalid) {
      res.writeHead(invalid.status, { "content-type": "application/json" });
      res.end(JSON.stringify(invalid.body));
      return;
    }

    const messages: Array<{ role: string; content: string }> = payload.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Exact historical repro from commit 2a893b37: stop=["><"], max_tokens=2.
    const isStopStraddleRepro = Array.isArray(payload.stop) && payload.stop.includes("><") && payload.max_tokens === 2;

    if (isStopStraddleRepro) {
      const correctText = "<unk"; // both lanes must agree on this
      if (payload.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        if (BUG_MODE === "stop_straddle") {
          // Reproduce the exact pre-fix bug: delta1 untruncated, delta2 re-sends the whole truncated text.
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "<unk>" } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "<unk" } }] })}\n\n`);
        } else {
          // Fixed behavior: hold back until the terminating step, then release the correctly truncated text once.
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: correctText } }] })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const promptTokens = Math.max(1, Math.round(lastUser.length / 4));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "mock-" + Date.now(),
          model: payload.model,
          choices: [{ index: 0, message: { role: "assistant", content: correctText }, finish_reason: "stop" }],
          usage: { prompt_tokens: promptTokens, completion_tokens: 2, total_tokens: promptTokens + 2 },
        }),
      );
      return;
    }

    const replyText = deterministicReply(lastUser);
    const promptTokens = Math.max(1, Math.round(lastUser.length / 4));
    const completionTokens = Math.max(1, Math.round(replyText.length / 4));

    if (payload.stream) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const CHUNK_SIZE = 6;
      for (let i = 0; i < replyText.length; i += CHUNK_SIZE) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: replyText.slice(i, i + CHUNK_SIZE) } }] })}\n\n`);
      }
      if (payload.stream_options?.include_usage) {
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock-" + Date.now(),
        model: payload.model,
        choices: [{ index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`Mock Camelid server listening on http://127.0.0.1:${PORT}`);
  console.log(`  BUG_MODE=${BUG_MODE}`);
});
