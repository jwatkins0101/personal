/**
 * Lets a lane command report its counts to the lane wrapper (cos/bin/lane-run.sh), which
 * exports COS_RUN_SUMMARY. A no-op when the command runs outside the wrapper.
 */
import { writeFileSync } from "node:fs";

export interface LaneSummary {
  items_in: number;
  items_out: Record<string, number>;
  status?: "ok" | "partial";
  artifacts?: string[];
  findings?: { claim: string; source_ref: string }[];
  open_questions?: string[];
  gaps?: string[];
  cost_usd?: number | null;
}

export function writeLaneSummary(summary: LaneSummary): void {
  const path = process.env.COS_RUN_SUMMARY;
  if (!path) return;
  writeFileSync(path, JSON.stringify(summary));
}
