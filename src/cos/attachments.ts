/**
 * Attachment text for "Hand to agent" (D25, AC-34). The agent can't download or open files (its
 * allowlist is read-only Gmail + text tools), so this code extracts the text of the item's
 * attachments first and hands it over as data. Size-capped; unreadable files become gaps.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

export const MAX_ATTACHMENTS = 5;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_CHARS_EACH = 20000;
export const MAX_CHARS_TOTAL = 30000;

export interface AttachmentText { name: string; text: string | null; note?: string }

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 20 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};
const clean = (s: string) => s.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const xmlText = (x: string) => x.replace(/<\/(w:p|a:p|p|row)>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/[ \t]{2,}/g, " ");

/** Extracts readable text from one file's bytes. Returns null text with a note when the type isn't supported. */
export function extractText(name: string, data: Buffer): AttachmentText {
  if (data.length > MAX_BYTES) return { name, text: null, note: `too large (${Math.round(data.length / 1e6)} MB)` };
  const ext = extname(name).toLowerCase();
  if ([".txt", ".csv", ".md", ".json", ".ics"].includes(ext)) return { name, text: clean(data.toString("utf8")).slice(0, MAX_CHARS_EACH) };
  const dir = mkdtempSync(join(tmpdir(), "cos-att-"));
  const file = join(dir, `f${ext}`);
  try {
    writeFileSync(file, data);
    let out: string | null = null;
    if ([".doc", ".docx", ".rtf", ".odt", ".html", ".htm", ".webarchive"].includes(ext)) out = run("/usr/bin/textutil", ["-convert", "txt", "-stdout", file]);
    else if (ext === ".pdf") out = run("pdftotext", ["-layout", "-q", file, "-"]);
    else if (ext === ".pptx") out = run("/usr/bin/unzip", ["-p", file, "ppt/slides/slide*.xml"]) && xmlText(run("/usr/bin/unzip", ["-p", file, "ppt/slides/slide*.xml"])!);
    else if (ext === ".xlsx") out = run("/usr/bin/unzip", ["-p", file, "xl/sharedStrings.xml"]) && xmlText(run("/usr/bin/unzip", ["-p", file, "xl/sharedStrings.xml"])!);
    else return { name, text: null, note: `can't read ${ext || "this file type"}` };
    if (!out || !out.trim()) return { name, text: null, note: "no readable text (scanned image or protected file?)" };
    return { name, text: clean(out).slice(0, MAX_CHARS_EACH) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: Part[] };

/** Reads and extracts the attachments of one message (runs inside the right withAccount). */
export async function messageAttachments(gmailId: string, fetchJson: (path: string) => Promise<unknown>): Promise<AttachmentText[]> {
  const msg = (await fetchJson(`/messages/${gmailId}?format=full`)) as { payload: Part };
  const flat = (p: Part): Part[] => [p, ...(p.parts ?? []).flatMap(flat)];
  const files = flat(msg.payload).filter((p) => p.filename && p.body?.attachmentId && !/^image\//.test(p.mimeType ?? ""));
  const out: AttachmentText[] = [];
  let total = 0;
  for (const p of files.slice(0, MAX_ATTACHMENTS)) {
    if ((p.body?.size ?? 0) > MAX_BYTES) { out.push({ name: p.filename!, text: null, note: "too large" }); continue; }
    const a = (await fetchJson(`/messages/${gmailId}/attachments/${p.body!.attachmentId}`)) as { data: string };
    const t = extractText(p.filename!, Buffer.from(a.data, "base64url"));
    if (t.text && total + t.text.length > MAX_CHARS_TOTAL) t.text = t.text.slice(0, Math.max(0, MAX_CHARS_TOTAL - total)) || null;
    total += t.text?.length ?? 0;
    out.push(t);
  }
  if (files.length > MAX_ATTACHMENTS) out.push({ name: `${files.length - MAX_ATTACHMENTS} more`, text: null, note: `only the first ${MAX_ATTACHMENTS} attachments were read` });
  return out;
}
