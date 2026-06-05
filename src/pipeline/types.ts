// Pipeline orchestrator types
// Pure type definitions — no runtime dependencies.

// ---------------------------------------------------------------------------
// Step names & status
// ---------------------------------------------------------------------------

export type StepName = "ingest" | "sort" | "route" | "briefing";

export type StepStatus = "success" | "partial" | "failed" | "skipped";

// ---------------------------------------------------------------------------
// Step result (returned by every step)
// ---------------------------------------------------------------------------

export interface StepResult {
  status: StepStatus;
  /** Flexible per-step metrics (e.g. inserted, duplicates, classified). */
  counts: Record<string, number>;
  /** Optional outputs like note IDs, file paths, etc. */
  artifacts?: Record<string, unknown>;
  /** Present only when the step encountered an error. */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  startedAt: Date;
  finishedAt: Date;
}

// ---------------------------------------------------------------------------
// Pipeline profiles
// ---------------------------------------------------------------------------

export interface PipelineProfile {
  name: string;
  steps: StepName[];
  description: string;
}

export const PROFILES: Record<string, PipelineProfile> = {
  full: {
    name: "full",
    steps: ["ingest", "sort", "route", "briefing"],
    description: "Full daily pipeline",
  },
  refresh: {
    name: "refresh",
    steps: ["ingest", "sort"],
    description: "Midday refresh - ingest and classify only",
  },
  morning: {
    name: "morning",
    steps: ["ingest", "sort", "route", "briefing"],
    description: "Morning run with briefing",
  },
  "route-only": {
    name: "route-only",
    steps: ["route", "briefing"],
    description: "Route and briefing only",
  },
  "briefing-only": {
    name: "briefing-only",
    steps: ["briefing"],
    description: "Generate briefing from existing data",
  },
};

// ---------------------------------------------------------------------------
// Pipeline options (CLI / caller configuration)
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  /** Profile name — defaults to 'full'. */
  profile?: string;
  /** When true, steps report what they *would* do without side-effects. */
  dryRun?: boolean;
  /** Override the profile's step list. */
  steps?: StepName[];
  /** Start from this step, skipping earlier ones in the profile. */
  fromStep?: StepName;
  /** Emit detailed log output. */
  verbose?: boolean;
  /** Max retries per step (default 2). */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Pipeline context (shared across all steps during a run)
// ---------------------------------------------------------------------------

export interface PipelineContext {
  runId: string;
  startedAt: Date;
  options: PipelineOptions;
  results: Map<StepName, StepResult>;
  log: (
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

// ---------------------------------------------------------------------------
// Pipeline run result (returned when the entire pipeline completes)
// ---------------------------------------------------------------------------

export interface PipelineRunResult {
  runId: string;
  profile: string;
  /** Overall status: 'success' if all steps succeeded, 'partial' if any
   *  were partial/skipped, 'failed' if any step failed. */
  status: StepStatus;
  steps: Array<{ name: StepName; result: StepResult }>;
  startedAt: Date;
  finishedAt: Date;
  wallClockMs: number;
}

// ---------------------------------------------------------------------------
// Step interface (the contract each step implements)
// ---------------------------------------------------------------------------

export interface Step {
  name: StepName;
  /** Optional pre-flight check — return { ready: false, reason } to skip. */
  preflight?(ctx: PipelineContext): Promise<{ ready: boolean; reason?: string }>;
  /** Execute the step. */
  run(ctx: PipelineContext): Promise<StepResult>;
}
