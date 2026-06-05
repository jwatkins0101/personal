// Pipeline step wrappers — adapt refactored command functions into the Step
// interface so the orchestrator can run them uniformly.

import type { Step, PipelineContext, StepResult } from "./types.js";
import { runIngest } from "../commands/ingest.js";
import { runSort } from "../commands/sort.js";
import { runRoute } from "../commands/route.js";
import { runBriefing } from "../commands/briefing.js";
import {
  checkMailReady,
  checkCalendarReady,
  checkNotesReady,
  checkClaudeCLI,
  checkMessagesDB,
} from "./preflight.js";

// ---------------------------------------------------------------------------
// ingest
// ---------------------------------------------------------------------------

export const ingestStep: Step = {
  name: "ingest",

  async preflight(ctx: PipelineContext) {
    const [mail, calendar, messages] = await Promise.all([
      checkMailReady(),
      checkCalendarReady(),
      checkMessagesDB(),
    ]);

    if (!mail.ready) {
      ctx.log("warn", `Mail preflight: ${mail.reason}`);
    }
    if (!calendar.ready) {
      ctx.log("warn", `Calendar preflight: ${calendar.reason}`);
    }
    if (!messages.ready) {
      ctx.log("warn", `Messages preflight: ${messages.reason}`);
    }

    // Ingest handles partial failures internally, so always report ready.
    return { ready: true };
  },

  async run(ctx: PipelineContext) {
    return runIngest({ verbose: ctx.options.verbose ?? false });
  },
};

// ---------------------------------------------------------------------------
// sort
// ---------------------------------------------------------------------------

export const sortStep: Step = {
  name: "sort",

  async preflight(_ctx: PipelineContext) {
    const claude = await checkClaudeCLI();
    if (!claude.ready) {
      return {
        ready: false,
        reason: claude.reason ?? "Claude CLI is not available",
      };
    }
    return { ready: true };
  },

  async run(ctx: PipelineContext) {
    return runSort({ verbose: ctx.options.verbose ?? false });
  },
};

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

export const routeStep: Step = {
  name: "route",

  async preflight(_ctx: PipelineContext) {
    const notes = await checkNotesReady();
    if (!notes.ready) {
      return {
        ready: false,
        reason: notes.reason ?? "Notes.app is not available",
      };
    }
    return { ready: true };
  },

  async run(ctx: PipelineContext) {
    return runRoute({
      dryRun: ctx.options.dryRun,
      verbose: ctx.options.verbose ?? false,
    });
  },
};

// ---------------------------------------------------------------------------
// briefing
// ---------------------------------------------------------------------------

export const briefingStep: Step = {
  name: "briefing",

  async preflight(ctx: PipelineContext) {
    const [notes, calendar] = await Promise.all([
      checkNotesReady(),
      checkCalendarReady(),
    ]);

    if (!notes.ready) {
      return {
        ready: false,
        reason: notes.reason ?? "Notes.app is not available",
      };
    }

    if (!calendar.ready) {
      ctx.log("warn", `Calendar preflight: ${calendar.reason}`);
    }

    return { ready: true };
  },

  async run(ctx: PipelineContext) {
    return runBriefing({
      dryRun: ctx.options.dryRun,
      verbose: ctx.options.verbose ?? false,
    });
  },
};

// ---------------------------------------------------------------------------
// All steps in pipeline order
// ---------------------------------------------------------------------------

export const ALL_STEPS: Step[] = [
  ingestStep,
  sortStep,
  routeStep,
  briefingStep,
];
