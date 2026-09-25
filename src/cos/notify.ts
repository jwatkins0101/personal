/**
 * One-line morning ping to the principal's own devices (D2, AC-15).
 * iMessage via Messages.app with a hard timeout; on failure, fall back to an email to self.
 * The recipient is fixed to the principal's own handle and can't be changed by brief content.
 */
import { spawnSync } from "node:child_process";
import { createDraft, sendDraft } from "../mail/gmail-api.js";

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
