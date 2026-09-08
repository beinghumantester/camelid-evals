// Shared test helper: a tiny in-process HTTP server so probe.ts's functions (which call
// scripts/lib/camelid-client.ts, which reads CAMELID_BASE_URL) can be exercised against a
// fully controlled, synthetic backend instead of a live/mock Camelid instance. Not a test
// file itself — imported by tests that need one.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type TestHandler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

export interface TestServerHandle {
  url: string;
  close: () => Promise<void>;
}

/** Starts an ephemeral HTTP server on a random free port and returns its base URL. Caller is
 * responsible for calling close() when done (and for setting/restoring process.env.CAMELID_BASE_URL). */
export async function startTestServer(handler: TestHandler): Promise<TestServerHandle> {
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => handler(req, res, data));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
