// Pipeline execution engine
// Orchestrates step execution with retries, persistence, and logging.

import { randomBytes } from "crypto";
import { getDb } from "../storage/index.js";
import {
  PROFILES,
  type PipelineContext,
  type PipelineOptions,
  type PipelineRunResult,
  type Step,
  type StepName,
  type StepResult,
  type StepStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate a run ID like `run_20260225_143052_abc`.
 */
export function generateRunId(): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const rand = randomBytes(2).toString("hex").slice(0, 3);
  return `run_${date}_${time}_${rand}`;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const LEVEL_SYMBOLS: Record<"info" | "warn" | "error", string> = {
  info: "\u00b7", // ·
  warn: "!",
  error: "\u2717", // ✗
};

/**
 * Create a log function for the pipeline context.
 *
 * - verbose=true  -> prints INFO, WARN, ERROR
 * - verbose=false -> prints WARN and ERROR only
 */
export function createLogger(
  verbose: boolean,
): PipelineContext["log"] {
  return (
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => {
    if (!verbose && level === "info") return;

    const symbol = LEVEL_SYMBOLS[level];
    const tag = level.toUpperCase();
    let line = `[${tag}] ${symbol} ${message}`;
    if (data && Object.keys(data).length > 0) {
      line += ` ${JSON.stringify(data)}`;
    }

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  };
}

// ---------------------------------------------------------------------------
// DB persistence helpers
// ---------------------------------------------------------------------------

/**
 * Insert a pipeline_runs row with status 'running'.
 */
export function persistRunStart(
  runId: string,
  profile: string,
  options: PipelineOptions,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO pipeline_runs (id, profile, status, options_json, started_at)
     VALUES (?, ?, 'running', ?, ?)`,
  ).run(runId, profile, JSON.stringify(options), new Date().toISOString());
}

/**
 * Insert a pipeline_steps row with the step's result data.
 */
export function persistStepResult(
  runId: string,
  stepName: StepName,
  result: StepResult,
  attempt: number,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO pipeline_steps (run_id, step_name, status, counts_json, artifacts_json, error_code, error_message, attempt, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    stepName,
    result.status,
    JSON.stringify(result.counts),
    result.artifacts ? JSON.stringify(result.artifacts) : null,
    result.error?.code ?? null,
    result.error?.message ?? null,
    attempt,
    result.startedAt.toISOString(),
    result.finishedAt.toISOString(),
  );
}

/**
 * Update the pipeline_runs row with final status and timing.
 */
export function persistRunEnd(
  runId: string,
  status: StepStatus,
  stepsJson: string,
  wallClockMs: number,
  errorMessage?: string,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE pipeline_runs
        SET status = ?, steps_json = ?, wall_clock_ms = ?, error_message = ?, finished_at = ?
      WHERE id = ?`,
  ).run(
    status,
    stepsJson,
    wallClockMs,
    errorMessage ?? null,
    new Date().toISOString(),
    runId,
  );
}

// ---------------------------------------------------------------------------
// Status computation
// ---------------------------------------------------------------------------

/**
 * Derive an overall pipeline status from individual step results.
 *
 * - 'success' if ALL steps are success or skipped
 * - 'partial' if at least one step is partial, or a mix of success and skipped
 * - 'failed' if ANY step failed
 */
export function computeOverallStatus(
  results: Map<StepName, StepResult>,
): StepStatus {
  const statuses = Array.from(results.values()).map((r) => r.status);

  if (statuses.length === 0) return "success";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "partial")) return "partial";

  // At this point every status is either 'success' or 'skipped'.
  const hasSuccess = statuses.includes("success");
  const hasSkipped = statuses.includes("skipped");
  if (hasSuccess && hasSkipped) return "partial";

  // All the same — return whatever that is.
  return statuses[0];
}

// ---------------------------------------------------------------------------
// Failure policy
// ---------------------------------------------------------------------------

/**
 * Decide whether the pipeline should continue after a step fails.
 *
 * - ingest failed  -> continue (sort will find 0 new items and skip)
 * - sort failed    -> continue (route can work with previously-sorted items)
 * - route failed   -> continue (briefing reads from DB directly)
 * - briefing failed -> stop (last step anyway)
 */
export function shouldContinueAfterFailure(
  stepName: StepName,
  _result: StepResult,
): boolean {
  switch (stepName) {
    case "ingest":
    case "sort":
    case "route":
      return true;
    case "briefing":
      return false;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline runner
// ---------------------------------------------------------------------------

/**
 * Execute the pipeline: resolve steps, run each with optional retries,
 * persist results, and return a summary.
 */
export async function runPipeline(
  steps: Step[],
  options: PipelineOptions = {},
): Promise<PipelineRunResult> {
  // 1. Resolve profile and step list
  const profileName = options.profile ?? "full";
  const profile = PROFILES[profileName] ?? PROFILES.full;
  let stepNames: StepName[] = profile.steps;

  // Override step list if explicitly provided
  if (options.steps && options.steps.length > 0) {
    stepNames = options.steps;
  }

  // Trim to start from a specific step
  if (options.fromStep) {
    const idx = stepNames.indexOf(options.fromStep);
    if (idx >= 0) {
      stepNames = stepNames.slice(idx);
    }
  }

  // Filter the provided steps array to only those in the resolved list
  const stepsToRun = stepNames
    .map((name) => steps.find((s) => s.name === name))
    .filter((s): s is Step => s != null);

  // 2. Setup
  const runId = generateRunId();
  const startedAt = new Date();
  const maxRetries = options.maxRetries ?? 2;
  const log = createLogger(options.verbose ?? false);

  const ctx: PipelineContext = {
    runId,
    startedAt,
    options,
    results: new Map(),
    log,
  };

  // 3. Persist run start
  persistRunStart(runId, profileName, options);
  log("info", `Pipeline ${runId} started`, { profile: profileName, steps: stepNames });

  // 4. Execute steps
  for (const step of stepsToRun) {
    // 4a. Preflight check
    if (step.preflight) {
      const check = await step.preflight(ctx);
      if (!check.ready) {
        const skipped: StepResult = {
          status: "skipped",
          counts: {},
          startedAt: new Date(),
          finishedAt: new Date(),
        };
        ctx.results.set(step.name, skipped);
        persistStepResult(runId, step.name, skipped, 0);
        log("info", `Step ${step.name} skipped: ${check.reason ?? "not ready"}`);
        continue;
      }
    }

    // 4b. Run with retry logic
    let result: StepResult | undefined;
    let attempt = 0;

    for (attempt = 1; attempt <= maxRetries + 1; attempt++) {
      result = await step.run(ctx);

      // If succeeded (or non-retryable failure), stop retrying
      if (result.status !== "failed" || !result.error?.retryable) {
        break;
      }

      // If we have retries left, wait and try again
      if (attempt <= maxRetries) {
        log("warn", `Step ${step.name} failed (attempt ${attempt}), retrying...`, {
          error: result.error.message,
        });
        await sleep(2000);
      }
    }

    // result is guaranteed to be set since stepsToRun is non-empty in this loop
    const finalResult = result!;

    // 4c. Record result
    ctx.results.set(step.name, finalResult);

    // 4d. Persist step result
    persistStepResult(runId, step.name, finalResult, attempt);

    // 4e. Log step outcome
    log(
      finalResult.status === "failed" ? "error" : "info",
      `Step ${step.name} ${finalResult.status}`,
      { counts: finalResult.counts, ...(finalResult.error ? { error: finalResult.error.message } : {}) },
    );

    // 4f. Check failure policy
    if (finalResult.status === "failed") {
      if (!shouldContinueAfterFailure(step.name, finalResult)) {
        log("error", `Pipeline stopping after ${step.name} failure`);
        break;
      }
      log("warn", `Continuing pipeline despite ${step.name} failure`);
    }
  }

  // 5. Compute overall status
  const overallStatus = computeOverallStatus(ctx.results);

  // 6. Build result
  const finishedAt = new Date();
  const wallClockMs = finishedAt.getTime() - startedAt.getTime();

  const stepResults: PipelineRunResult["steps"] = [];
  for (const step of stepsToRun) {
    const r = ctx.results.get(step.name);
    if (r) {
      stepResults.push({ name: step.name, result: r });
    }
  }

  // 7. Persist run end
  const firstError = stepResults.find((s) => s.result.status === "failed");
  persistRunEnd(
    runId,
    overallStatus,
    JSON.stringify(stepResults.map((s) => ({ name: s.name, status: s.result.status }))),
    wallClockMs,
    firstError?.result.error?.message,
  );

  log("info", `Pipeline ${runId} finished: ${overallStatus}`, { wallClockMs });

  return {
    runId,
    profile: profileName,
    status: overallStatus,
    steps: stepResults,
    startedAt,
    finishedAt,
    wallClockMs,
  };
}
