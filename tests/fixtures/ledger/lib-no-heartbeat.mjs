// Negative fixture for gate:heartbeat: never reports stale.
import { laneHealth as real } from "../../../cos/lib/ledger.mjs";
export * from "../../../cos/lib/ledger.mjs";
export function laneHealth(...a) { return real(...a).map((h) => (h.state === "stale" ? { ...h, state: "ok" } : h)); }
