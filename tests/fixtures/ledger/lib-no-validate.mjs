// Negative fixture for gate:ledger-schema: accepts and stores anything as-is.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export * from "../../../cos/lib/ledger.mjs";
export function validateRecord() { return []; }
export function appendRecord(r, dir) { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, `${r.lane}.jsonl`), JSON.stringify(r) + "\n"); return r; }
