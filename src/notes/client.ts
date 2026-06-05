// Apple Notes client via AppleScript

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { NoteCreateResult } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "../../scripts");

/**
 * Run a shell script and return its output.
 */
async function runScript(
  scriptName: string,
  args: string[] = []
): Promise<string> {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Script timed out after 60 seconds"));
    }, 60000);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout.trim());
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

/**
 * Parse the result from note scripts.
 * Format: "action:data" e.g., "created:x-coredata://..."
 */
function parseResult(output: string): NoteCreateResult {
  const colonIndex = output.indexOf(":");
  if (colonIndex === -1) {
    return { success: false, action: "error", error: output };
  }

  const action = output.slice(0, colonIndex);
  const data = output.slice(colonIndex + 1);

  if (action === "error") {
    return { success: false, action: "error", error: data };
  }

  return {
    success: true,
    action: action as "created" | "updated",
    noteId: data,
  };
}

/**
 * Create a new note in Apple Notes.
 */
export async function createNote(
  title: string,
  body: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  try {
    const output = await runScript("create-note.sh", [title, body, folder]);
    return parseResult(output);
  } catch (err) {
    return {
      success: false,
      action: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Update an existing note or create if not found.
 */
export async function updateNote(
  title: string,
  body: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  try {
    const output = await runScript("update-note.sh", [title, body, folder]);
    return parseResult(output);
  } catch (err) {
    return {
      success: false,
      action: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Create or update a note based on whether it exists.
 * This is a convenience wrapper around updateNote.
 */
export async function upsertNote(
  title: string,
  body: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  return updateNote(title, body, folder);
}

/**
 * Duplicate a template note with a new title.
 * Preserves all formatting including checklists.
 */
export async function duplicateNote(
  templateTitle: string,
  newTitle: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  try {
    const output = await runScript("duplicate-note.sh", [
      templateTitle,
      newTitle,
      folder,
    ]);
    return parseResult(output);
  } catch (err) {
    return {
      success: false,
      action: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Update a marked section in a note.
 * Finds <!-- SECTION_START --> and <!-- SECTION_END --> markers.
 * Only replaces content between markers, preserving checklists elsewhere.
 */
export async function updateNoteSection(
  noteTitle: string,
  sectionName: string,
  content: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  try {
    const output = await runScript("update-note-section.sh", [
      noteTitle,
      sectionName,
      content,
      folder,
    ]);
    return parseResult(output);
  } catch (err) {
    return {
      success: false,
      action: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Append text to the end of an existing note.
 */
export async function appendToNote(
  noteTitle: string,
  text: string,
  folder = "Notes"
): Promise<NoteCreateResult> {
  try {
    const output = await runScript("append-to-note.sh", [
      noteTitle,
      text,
      folder,
    ]);
    return parseResult(output);
  } catch (err) {
    return {
      success: false,
      action: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Create a briefing note from a template.
 * If already exists, updates the marked sections.
 */
export async function createBriefingFromTemplate(
  date: Date,
  sections: {
    urgent?: string;
    schedule?: string;
    connections?: string;
    reconnect?: string;
    actionItems?: string;
    reviewQueue?: string;
  },
  templateTitle = "Briefing Template",
  folder = "Briefings"
): Promise<NoteCreateResult> {
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const noteTitle = `📋 Briefing - ${dateStr}`;

  // First, try to duplicate from template (creates if not exists)
  const dupResult = await duplicateNote(templateTitle, noteTitle, folder);

  if (!dupResult.success && !dupResult.error?.includes("exists")) {
    if (dupResult.error?.includes("Template not found")) {
      return {
        success: false,
        action: "error",
        error: `Template "${templateTitle}" not found in folder "${folder}". Please create it manually with checklist sections.`,
      };
    }
    return dupResult;
  }

  // Update each section that has content
  const sectionUpdates: Promise<NoteCreateResult>[] = [];

  if (sections.urgent) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "URGENT", sections.urgent, folder)
    );
  }
  if (sections.schedule) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "SCHEDULE", sections.schedule, folder)
    );
  }
  if (sections.connections) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "CONNECTIONS", sections.connections, folder)
    );
  }
  if (sections.reconnect) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "RECONNECT", sections.reconnect, folder)
    );
  }
  if (sections.actionItems) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "ACTION_ITEMS", sections.actionItems, folder)
    );
  }
  if (sections.reviewQueue) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "REVIEW_QUEUE", sections.reviewQueue, folder)
    );
  }

  // Wait for all section updates
  const results = await Promise.all(sectionUpdates);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    return {
      success: true,
      action: dupResult.action as "created" | "updated",
      noteId: dupResult.noteId,
      error: `Some sections failed to update: ${failures.map((f) => f.error).join(", ")}`,
    };
  }

  return {
    success: true,
    action: dupResult.action === "exists" ? "updated" : "created",
    noteId: dupResult.noteId,
  };
}

/**
 * Create a daily tasks note from a template.
 * If already exists, updates the marked sections.
 */
export async function createDailyTasksNote(
  date: Date,
  sections: {
    mustDo?: string;
    followUps?: string;
    waitingOn?: string;
    niceToDo?: string;
  },
  templateTitle = "Daily Tasks Template",
  folder = "Second Brain"
): Promise<NoteCreateResult> {
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const noteTitle = `Daily Tasks - ${dateStr}`;

  // First, try to duplicate from template (creates if not exists)
  const dupResult = await duplicateNote(templateTitle, noteTitle, folder);

  if (!dupResult.success && !dupResult.error?.includes("exists")) {
    // If template doesn't exist, fall back to creating a plain note
    if (dupResult.error?.includes("Template not found")) {
      return {
        success: false,
        action: "error",
        error: `Template "${templateTitle}" not found in folder "${folder}". Please create it manually with checklist sections.`,
      };
    }
    return dupResult;
  }

  // Update each section that has content
  const sectionUpdates: Promise<NoteCreateResult>[] = [];

  if (sections.mustDo) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "MUST_DO", sections.mustDo, folder)
    );
  }
  if (sections.followUps) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "FOLLOW_UPS", sections.followUps, folder)
    );
  }
  if (sections.waitingOn) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "WAITING_ON", sections.waitingOn, folder)
    );
  }
  if (sections.niceToDo) {
    sectionUpdates.push(
      updateNoteSection(noteTitle, "NICE_TO_DO", sections.niceToDo, folder)
    );
  }

  // Wait for all section updates
  const results = await Promise.all(sectionUpdates);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    return {
      success: true, // Note was created/exists
      action: dupResult.action as "created" | "updated",
      noteId: dupResult.noteId,
      error: `Some sections failed to update: ${failures.map((f) => f.error).join(", ")}`,
    };
  }

  return {
    success: true,
    action: dupResult.action === "exists" ? "updated" : "created",
    noteId: dupResult.noteId,
  };
}
