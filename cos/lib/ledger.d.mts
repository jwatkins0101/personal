export interface RunRecord {
  lane: string; run_id: string; status: "ok" | "partial" | "failed";
  started_at: string; finished_at: string;
  items_in: number | null; items_out: Record<string, number> | null;
  artifacts: string[];
  findings: { claim: string; source_ref: string }[];
  proposed_actions: { id: string; action: string; risk_tier: "A1" | "A2" | "A3"; source_ref: string; payload?: unknown }[];
  open_questions: string[]; gaps: string[]; cost_usd: number | null;
}
export interface LaneConfig { lane: string; label?: string; schedule: { days: number[]; times: string[] }; grace_minutes: number; counts?: boolean }
export interface LaneHealth { lane: string; state: "ok" | "stale" | "failing" | "partial"; last_started_at: string | null; last_status: string | null; expected_since: string | null; gaps: string[] }
export const DEFAULT_LEDGER_DIR: string;
export function validateRecord(r: unknown): string[];
export function enforceInvariants(r: RunRecord): RunRecord;
export function appendRecord(r: unknown, dir?: string): RunRecord;
export function readRecords(lane: string, dir?: string): RunRecord[];
export function lastScheduledAt(schedule: { days: number[]; times: string[] }, now: Date): Date | null;
export function laneHealth(config: { lanes: LaneConfig[] }, now?: Date, dir?: string): LaneHealth[];
