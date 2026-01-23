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
