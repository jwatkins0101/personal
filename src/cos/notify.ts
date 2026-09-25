/**
 * One-line morning ping to the principal's own devices (D2, AC-15).
 * iMessage via Messages.app with a hard timeout; on failure, fall back to an email to self.
 * The recipient is fixed to the principal's own handle and can't be changed by brief content.
 */
import { spawnSync } from "node:child_process";
import { createDraft, sendDraft } from "../mail/gmail-api.js";
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const SELF_HANDLE = "jermainewatkins@gmail.com";

const asString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function sendIMessageToSelf(text: string, timeoutMs = 60_000): { ok: boolean; error?: string } {
  // Some Messages accounts error when asked for their service type, which breaks a `whose` filter,
  // so check each account on its own and use the first iMessage one.
  const script = `tell application "Messages"
  set svc to missing value
  repeat with a in accounts
    try
      if ((service type of a) as text) is "iMessage" and (enabled of a) then
        set svc to a
        exit repeat
      end if
    end try
  end repeat
  if svc is missing value then error "no enabled iMessage account"
  send ${asString(text)} to participant ${asString(SELF_HANDLE)} of svc
end tell`;
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: timeoutMs });
  if (r.error) return { ok: false, error: `osascript: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, error: (r.stderr || `exit ${r.status}`).trim().slice(0, 200) };
  return { ok: true };
}

/**
 * Messages can't send files from ~/Library/Application Support (the transfer fails with error 25),
 * so audio is staged in ~/Pictures/Chief of Staff, which it can read. Keeps the newest `keep` files.
 */
export const AUDIO_STAGE_DIR = process.env.COS_AUDIO_STAGE_DIR ?? join(homedir(), "Pictures/Chief of Staff");

export function stageForMessages(src: string, name: string, keep = 14, dir = AUDIO_STAGE_DIR): string {
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, name);
  copyFileSync(src, dest);
  const files = readdirSync(dir).filter((f) => f.endsWith(".mp3")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const old of files.slice(keep)) unlinkSync(join(dir, old.f));
  return dest;
}

/** Sends a file (e.g. the brief's MP3) to the principal's own iMessage handle. */
export function sendIMessageFileToSelf(path: string, timeoutMs = 60_000): { ok: boolean; error?: string } {
  const script = `tell application "Messages"
  set svc to missing value
  repeat with a in accounts
    try
      if ((service type of a) as text) is "iMessage" and (enabled of a) then
        set svc to a
        exit repeat
      end if
    end try
  end repeat
  if svc is missing value then error "no enabled iMessage account"
  send (POSIX file ${asString(path)}) to participant ${asString(SELF_HANDLE)} of svc
end tell`;
  const r = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: timeoutMs });
  if (r.error) return { ok: false, error: `osascript: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, error: (r.stderr || `exit ${r.status}`).trim().slice(0, 200) };
  return { ok: true };
}

export async function emailSelf(subject: string, body: string): Promise<string> {
  const draftId = await createDraft({ to: SELF_HANDLE, subject, body });
  return sendDraft(draftId);
}

export async function pingSelf(text: string, subject: string): Promise<{ channel: "imessage" | "email" | "none"; error?: string }> {
  if (process.env.COS_NO_PING === "1") return { channel: "none" };
  const im = sendIMessageToSelf(text);
  if (im.ok) return { channel: "imessage" };
  try {
    await emailSelf(subject, text);
    return { channel: "email", error: `iMessage failed (${im.error}); emailed instead` };
  } catch (e) {
    return { channel: "none", error: `iMessage failed (${im.error}); email fallback failed (${(e as Error).message.slice(0, 120)})` };
  }
}
