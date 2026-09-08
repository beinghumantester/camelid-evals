import type { ChatCompletionRequest, ChatCompletionResponse, RawHttpResult } from "./types.js";

export function baseUrl(): string {
  return process.env.CAMELID_BASE_URL ?? "http://127.0.0.1:8181";
}

/** Exported for tests/camelid-client.test.ts — this is the exact distinction SC-4's
 * `top_k < 0` self-conformance case depends on: a bug here would silently make every
 * self-conformance case that checks error *kind* (typed vs. untyped 400) meaningless. */
export function isTypedErrorEnvelope(body: any): boolean {
  return Boolean(body && typeof body === "object" && body.error && typeof body.error === "object" && typeof body.error.type === "string" && typeof body.error.code === "string");
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<RawHttpResult<T>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed: T | undefined;
  try {
    parsed = raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    parsed = undefined;
  }
  return { status: res.status, body: parsed, raw, isTypedErrorEnvelope: isTypedErrorEnvelope(parsed) };
}

export function getCapabilities() {
  return request<any>("GET", "/api/capabilities");
}

/** Real HealthResponse shape per src/api/mod.rs (v0.6.1, confirmed unchanged in the fields
 * environment-integrity checks care about). Fields beyond these are ignored, not modeled. */
export interface HealthResponse {
  ok?: boolean;
  version?: string;
  build?: string;
  active_model_id?: string;
  backend?: string;
  vision_ready?: boolean;
  q8_runtime?: { metal?: boolean; cuda?: boolean };
}

export async function getHealth(): Promise<HealthResponse> {
  const result = await request<HealthResponse>("GET", "/v1/health");
  return result.body ?? {};
}

export function postJson<T>(path: string, body: unknown) {
  return request<T>("POST", path, body);
}

export function chatCompletion(reqBody: ChatCompletionRequest) {
  return request<ChatCompletionResponse>("POST", "/v1/chat/completions", { ...reqBody, stream: false });
}

export interface StreamedResult {
  status: number;
  text: string;
  raw: string;
}

export async function chatCompletionStream(reqBody: ChatCompletionRequest): Promise<StreamedResult> {
  const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...reqBody, stream: true }),
  });
  if (!res.body) return { status: res.status, text: "", raw: "" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let raw = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
        } catch {
          /* ignore malformed frames */
        }
      }
    }
  }
  return { status: res.status, text, raw };
}
