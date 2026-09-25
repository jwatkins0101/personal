// Negative fixture for gate:artifacts: reconciles counts but ignores claimed artifacts.
import { appendRecord as real } from "../../../cos/lib/ledger.mjs";
export * from "../../../cos/lib/ledger.mjs";
export function appendRecord(r, dir) { const s = real({ ...r, artifacts: [] }, dir); return { ...s, artifacts: r.artifacts }; }
