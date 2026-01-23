import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { retry } from "../utils/retry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = join(__dirname, "../../scripts/get-calendar-events.sh");

export interface CalendarEvent {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  calendar?: string;
  isAllDay: boolean;
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  return getEventsForDayOffset(0);
}

export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  return getEventsForDayOffset(1);
}

/**
 * Execute the calendar script for a given day offset.
 */
async function runCalendarScript(dayOffset: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn("bash", [SCRIPT_PATH, String(dayOffset)], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Manual timeout since spawn doesn't support timeout option
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Calendar script timed out after 45 seconds"));
    }, 45000);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code, signal) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout.trim());
      } else if (signal) {
        reject(new Error(`Process killed by signal: ${signal}`));
      } else {
        reject(new Error(`Script exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

async function getEventsForDayOffset(dayOffset: number): Promise<CalendarEvent[]> {
  try {
    // Retry up to 3 times with exponential backoff
    const result = await retry(
      () => runCalendarScript(dayOffset),
      {
        maxAttempts: 3,
        delayMs: 1000,
        onRetry: (attempt, error) => {
          console.warn(`Calendar fetch attempt ${attempt} failed: ${error.message}, retrying...`);
        },
      }
    );

    if (!result || result === "") {
      return [];
    }

    const events: CalendarEvent[] = [];
    const eventStrings = result.split("<||>").filter(s => s.trim() !== "");

    for (const eventStr of eventStrings) {
      const parts = eventStr.split("<|>");
      if (parts.length >= 4) {
        const [title, startTime, endTime, isAllDay, location, calendar] = parts;
        events.push({
          title: title || "Untitled",
          startTime: normalizeDate(startTime || ""),
          endTime: normalizeDate(endTime || ""),
          location: location && location.trim() !== "" ? location : undefined,
          calendar: calendar || undefined,
          isAllDay: isAllDay === "true",
        });
      }
    }

    // Sort by start time (all-day first, then by time)
    events.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    return events;
  } catch (err) {
    // Silently return empty on errors - calendar may just be slow or inaccessible
    return [];
  }
}

/**
 * Normalize AppleScript date format to parseable format.
 * Converts "Friday, January 23, 2026 at 8:00:00 AM" to ISO-parseable string.
 */
function normalizeDate(dateStr: string): string {
  // Remove "at" which JavaScript Date can't parse
  return dateStr.replace(" at ", " ");
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.isAllDay) {
    return "All day";
  }

  try {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };

    const startStr = start.toLocaleTimeString("en-US", timeOptions);
    const endStr = end.toLocaleTimeString("en-US", timeOptions);

    return `${startStr} - ${endStr}`;
  } catch {
    return event.startTime;
  }
}
