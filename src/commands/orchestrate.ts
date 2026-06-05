// Orchestrate command: CLI entry point for running the pipeline
//
// Usage:
//   npm run pipeline
//   npm run pipeline -- --profile refresh
//   npm run pipeline -- --steps ingest,sort --dry-run --verbose

import {
  runPipeline,
  ALL_STEPS,
  PROFILES,
  type StepName,
  type PipelineOptions,
  type PipelineRunResult,
} from "../pipeline/index.js";
import { closeDb } from "../storage/index.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const VALID_STEPS: StepName[] = ["ingest", "sort", "route", "briefing"];

function parseArgs(): PipelineOptions & { help: boolean } {
  const args = process.argv.slice(2);
  let profile: string | undefined;
  let dryRun = false;
  let verbose = false;
  let steps: StepName[] | undefined;
  let fromStep: StepName | undefined;
  let maxRetries: number | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if ((arg === "--profile" || arg === "-p") && args[i + 1]) {
      profile = args[++i];
    } else if (arg === "--steps" && args[i + 1]) {
      const raw = args[++i].split(",").map((s) => s.trim());
      const invalid = raw.filter((s) => !VALID_STEPS.includes(s as StepName));
      if (invalid.length > 0) {
        console.error(`Unknown step(s): ${invalid.join(", ")}`);
        console.error(`Valid steps: ${VALID_STEPS.join(", ")}`);
        process.exit(1);
      }
      steps = raw as StepName[];
    } else if (arg === "--from" && args[i + 1]) {
      const raw = args[++i];
      if (!VALID_STEPS.includes(raw as StepName)) {
        console.error(`Unknown step: ${raw}`);
        console.error(`Valid steps: ${VALID_STEPS.join(", ")}`);
        process.exit(1);
      }
      fromStep = raw as StepName;
    } else if (arg === "--retries" && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (isNaN(n) || n < 0) {
        console.error("--retries must be a non-negative integer");
        process.exit(1);
      }
      maxRetries = n;
    }
  }

  return { profile, dryRun, verbose, steps, fromStep, maxRetries, help };
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Usage: npm run pipeline [-- options]

Options:
  --profile <name>, -p <name>   Pipeline profile (default: 'full')
  --dry-run                     Dry run mode (no side-effects)
  --verbose, -v                 Verbose output
  --steps <step1,step2>         Override steps (comma-separated)
  --from <step>                 Start from a specific step
  --retries <n>                 Max retries per step (default: 2)
  --help, -h                    Show this help message

Profiles:
${Object.values(PROFILES)
  .map((p) => `  ${p.name.padEnd(16)} ${p.steps.join(" -> ").padEnd(36)} ${p.description}`)
  .join("\n")}

Steps:
  ingest     Fetch mail, messages, and calendar into the database
  sort       Classify new items with the AI classifier
  route      Write sorted items to Apple Notes views
  briefing   Generate the daily briefing note

Examples:
  npm run pipeline                              # Full pipeline
  npm run pipeline -- -p refresh                # Ingest + sort only
  npm run pipeline -- --steps ingest,sort -v    # Custom steps, verbose
  npm run pipeline -- --from route              # Resume from route step
  npm run pipeline -- --dry-run                 # Preview without writing
`);
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function resolveStepNames(options: PipelineOptions): StepName[] {
  const profileName = options.profile ?? "full";
  const profile = PROFILES[profileName] ?? PROFILES.full;
  let stepNames: StepName[] = profile.steps;

  if (options.steps && options.steps.length > 0) {
    stepNames = options.steps;
  }

  if (options.fromStep) {
    const idx = stepNames.indexOf(options.fromStep);
    if (idx >= 0) {
      stepNames = stepNames.slice(idx);
    }
  }

  return stepNames;
}

function printBanner(options: PipelineOptions): void {
  const profileName = options.profile ?? "full";
  const stepNames = resolveStepNames(options);
  const stepsStr = stepNames.join(" -> ");
  const dryRunStr = options.dryRun ? "yes" : "no";

  // Compute the width needed for the content area
  const lines = [
    `  Pipeline: ${profileName}`,
    `  Steps: ${stepsStr}`,
    `  Dry run: ${dryRunStr}`,
  ];
  const maxLen = Math.max(...lines.map((l) => l.length));
  const width = maxLen + 4; // padding on each side

  const top = "\u250C" + "\u2500".repeat(width) + "\u2510";
  const bottom = "\u2514" + "\u2500".repeat(width) + "\u2518";

  console.log(top);
  for (const line of lines) {
    console.log("\u2502" + line.padEnd(width) + "\u2502");
  }
  console.log(bottom);
  console.log();
}

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, string> = {
  success: "\u2713 success",
  partial: "! partial",
  failed: "\u2717 failed",
  skipped: "- skipped",
};

/**
 * Build a one-line summary from a step's counts, tailored per step type.
 */
function stepSummary(name: StepName, counts: Record<string, number>, status: string): string {
  if (status === "skipped") return "skipped";

  switch (name) {
    case "ingest": {
      const inserted =
        (counts.emailsInserted ?? 0) +
        (counts.messagesInserted ?? 0) +
        (counts.calendarInserted ?? 0);
      const duplicates = counts.duplicates ?? 0;
      return `${inserted} new items, ${duplicates} duplicates`;
    }
    case "sort": {
      const classified = counts.classified ?? 0;
      const autoActed = counts.autoActed ?? 0;
      if (classified === 0) return "nothing to sort";
      return `${classified} classified, ${autoActed} auto-acted`;
    }
    case "route": {
      const routed = counts.totalRouted ?? 0;
      const folders = counts.routesSucceeded ?? 0;
      if (routed === 0) return "nothing to route";
      return `${routed} routed to ${folders} folders`;
    }
    case "briefing": {
      if (status === "failed") return "failed";
      return "briefing note created";
    }
    default:
      return "";
  }
}

/**
 * Format a duration in milliseconds as a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printReport(result: PipelineRunResult): void {
  const overallIcon = STATUS_ICONS[result.status] ?? result.status;

  console.log();
  console.log("\u2550".repeat(3) + " Pipeline Complete " + "\u2550".repeat(3));
  console.log(`Run ID:  ${result.runId}`);
  console.log(`Profile: ${result.profile}`);
  console.log(`Status:  ${overallIcon}`);
  console.log();
  console.log("Steps:");

  for (const { name, result: stepResult } of result.steps) {
    const icon = STATUS_ICONS[stepResult.status] ?? stepResult.status;
    const summary = stepSummary(name, stepResult.counts, stepResult.status);
    const duration = formatDuration(
      stepResult.finishedAt.getTime() - stepResult.startedAt.getTime(),
    );

    console.log(
      `  ${name.padEnd(10)} ${icon.padEnd(12)} ${summary.padEnd(36)} ${duration}`,
    );
  }

  console.log();
  console.log(`Total: ${formatDuration(result.wallClockMs)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { help, ...options } = parseArgs();

  if (help) {
    printHelp();
    process.exit(0);
  }

  printBanner(options);

  try {
    const result = await runPipeline(ALL_STEPS, options);
    printReport(result);

    if (result.status === "failed") {
      process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  closeDb();
  process.exit(1);
});
