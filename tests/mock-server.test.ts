// Integration test for mock-server/server.ts's BUG_MODE toggle: confirms switching
// BUG_MODE=stop_straddle actually changes the streamed response deterministically, and
// switching back to "fixed" restores the original bytes — i.e. the toggle itself doesn't leak
// state across requests. Spawns the real mock server as a child process (not a reimplementation
// of it) on an ephemeral port so this exercises the actual file, not a copy of its logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");

async function startMockServer(bugMode: "fixed" | "stop_straddle", port: number): Promise<ChildProcess> {
  const child = spawn(TSX_BIN, [join(ROOT, "mock-server", "server.ts")], {
    cwd: ROOT,
    env: { ...process.env, BUG_MODE: bugMode, MOCK_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  // Wait for the server's own "listening" log line rather than a fixed sleep.
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("mock server did not report listening in time")), 15000);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`mock server exited early with code ${code}: ${stderr}`));
    });
  });
  return child;
}

async function stopMockServer(child: ChildProcess): Promise<void> {
  child.kill();
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function streamedStopStraddleText(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "mock-model",
      messages: [{ role: "user", content: "trigger the stop-straddle repro" }],
      stop: ["><"],
      max_tokens: 2,
      stream: true,
    }),
  });
  const raw = await res.text();
  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    const parsed = JSON.parse(payload);
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string") text += delta;
  }
  return text;
}

test("BUG_MODE=stop_straddle reproduces the exact historical duplicated text", { timeout: 20000 }, async () => {
  const port = 18181;
  const child = await startMockServer("stop_straddle", port);
  try {
    const text = await streamedStopStraddleText(port);
    assert.equal(text, "<unk><unk");
  } finally {
    await stopMockServer(child);
  }
});

test("BUG_MODE=fixed produces the correct, non-duplicated text", { timeout: 20000 }, async () => {
  const port = 18182;
  const child = await startMockServer("fixed", port);
  try {
    const text = await streamedStopStraddleText(port);
    assert.equal(text, "<unk");
  } finally {
    await stopMockServer(child);
  }
});

test("the toggle does not leak state across requests: two consecutive requests to a BUG_MODE=fixed server both return the same correct text", { timeout: 20000 }, async () => {
  const port = 18183;
  const child = await startMockServer("fixed", port);
  try {
    const first = await streamedStopStraddleText(port);
    const second = await streamedStopStraddleText(port);
    assert.equal(first, "<unk");
    assert.equal(second, "<unk");
  } finally {
    await stopMockServer(child);
  }
});
