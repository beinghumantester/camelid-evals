// Unit tests for scripts/lib/ledger.ts — the "never fabricate a row" guardrail enforced in
// code, not just in SKILL.md prose. Reads the real fixtures/ledger-excerpt.json; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRows, loadLedgerExcerpt } from "../scripts/lib/ledger.js";

test("getRows returns real rows, in the requested order, for ids known to be in the fixture", () => {
  const excerpt = loadLedgerExcerpt();
  const realIds: string[] = excerpt.model_rows.map((r: any) => r.contract.id);
  assert.ok(realIds.length >= 2, "fixture must have at least 2 rows for this test to be meaningful");
  const [first, second] = realIds;
  const rows = getRows([second, first]); // deliberately reversed vs. fixture order
  assert.equal(rows.length, 2);
  assert.equal(rows[0].contract.id, second);
  assert.equal(rows[1].contract.id, first);
});

test("getRows throws — never silently returns empty/undefined — for a row id not in the fixture", () => {
  assert.throws(() => getRows(["this_row_id_does_not_exist_anywhere"]), /has no row with contract\.id/);
});

test("getRows throws on the FIRST unknown id even when mixed with known ids, rather than silently dropping it", () => {
  const excerpt = loadLedgerExcerpt();
  const realId = excerpt.model_rows[0].contract.id;
  assert.throws(() => getRows([realId, "definitely_not_a_real_row"]), /has no row with contract\.id 'definitely_not_a_real_row'/);
});

test("getRows on an empty id list returns an empty array without touching the fixture's rows", () => {
  assert.deepEqual(getRows([]), []);
});
