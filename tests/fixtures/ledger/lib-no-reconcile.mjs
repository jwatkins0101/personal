// Negative fixture for gate:reconcile: enforces artifacts but never reconciles counts.
import { appendRecord as real } from "../../../cos/lib/ledger.mjs";
export * from "../../../cos/lib/ledger.mjs";
export function appendRecord(r, dir) { const s = real({ ...r, items_in: null, items_out: null }, dir); return { ...s, items_in: r.items_in, items_out: r.items_out }; }
