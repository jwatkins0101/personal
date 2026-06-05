// Pipeline preflight checks — verify macOS apps and dependencies are available
// before the pipeline starts.

import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Generic app-running check
// ---------------------------------------------------------------------------

/**
 * Check whether a macOS application is currently running by querying
 * System Events for the process name.
 */
export async function checkAppRunning(appName: string): Promise<boolean> {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to (name of processes) contains "${appName}"'`,
      { timeout: 5000, encoding: "utf-8" },
    );
    return result.trim() === "true";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Individual readiness checks
// ---------------------------------------------------------------------------

type ReadinessResult = { ready: boolean; reason?: string };

/** Check that Apple Mail is running. */
export async function checkMailReady(): Promise<ReadinessResult> {
  const running = await checkAppRunning("Mail");
  if (!running) {
    return { ready: false, reason: "Mail.app is not running" };
  }
  return { ready: true };
}

/** Check that Apple Calendar is running. */
export async function checkCalendarReady(): Promise<ReadinessResult> {
  const running = await checkAppRunning("Calendar");
  if (!running) {
    return { ready: false, reason: "Calendar.app is not running" };
  }
  return { ready: true };
}

/** Check that Apple Notes is running. */
export async function checkNotesReady(): Promise<ReadinessResult> {
  const running = await checkAppRunning("Notes");
  if (!running) {
    return { ready: false, reason: "Notes.app is not running" };
  }
  return { ready: true };
}

/** Check that the Claude CLI is available on PATH. */
export async function checkClaudeCLI(): Promise<ReadinessResult> {
  try {
    const result = execSync("which claude", {
      timeout: 5000,
      encoding: "utf-8",
    });
    if (!result.trim()) {
      return { ready: false, reason: "Claude CLI not found on PATH" };
    }
    return { ready: true };
  } catch {
    return { ready: false, reason: "Claude CLI not found on PATH" };
  }
}

/** Check that the iMessage SQLite database exists on disk. */
export async function checkMessagesDB(): Promise<ReadinessResult> {
  const dbPath = join(homedir(), "Library", "Messages", "chat.db");
  if (!existsSync(dbPath)) {
    return { ready: false, reason: "Messages database not found" };
  }
  return { ready: true };
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

/**
 * Execute every preflight check in parallel and return a record keyed by
 * check name.
 */
export async function preflightAll(): Promise<Record<string, ReadinessResult>> {
  const [mail, calendar, notes, claude, messages] = await Promise.all([
    checkMailReady(),
    checkCalendarReady(),
    checkNotesReady(),
    checkClaudeCLI(),
    checkMessagesDB(),
  ]);

  return {
    mail,
    calendar,
    notes,
    claude,
    messages,
  };
}
