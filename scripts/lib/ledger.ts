import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

let cached: any | undefined;

/** Loads the real, trimmed ledger excerpt (fixtures/ledger-excerpt.json). Never fabricates a row. */
export function loadLedgerExcerpt(): any {
  if (!cached) {
    cached = JSON.parse(readFileSync(join(ROOT, "fixtures", "ledger-excerpt.json"), "utf8"));
  }
  return cached;
}

/** Returns the real ledger rows matching the given contract ids, in the order requested. Throws if any id is missing — never silently fabricates a row. */
export function getRows(ids: string[]): any[] {
  const excerpt = loadLedgerExcerpt();
  const byId = new Map<string, any>(excerpt.model_rows.map((r: any) => [r.contract.id, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Ledger excerpt has no row with contract.id '${id}'. Add it to fixtures/ledger-excerpt.json rather than fabricating one.`);
    return row;
  });
}
