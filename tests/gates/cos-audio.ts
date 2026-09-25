// gate: brief-audio (AC-35). The brief's MP3 is attached to the morning iMessage from a folder Messages
// can send from. COS_AUDIO_STAGE_DIR swaps the stage dir (negative: Application Support, which fails with error 25).
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const tmp = mkdtempSync(join(tmpdir(), "cos-audio-"));
try {
  const n = await import("../../src/cos/notify.ts");
  check(!/Library\/Application Support/.test(n.AUDIO_STAGE_DIR), "audio is staged outside ~/Library/Application Support (Messages can't send from there)");
  const src = join(tmp, "b.mp3"); writeFileSync(src, "ID3fake");
  const stage = join(tmp, "stage");
  for (let i = 1; i <= 16; i++) {
    const dest = n.stageForMessages(src, `Morning brief 2026-09-${String(i).padStart(2, "0")}.mp3`, 14, stage);
    utimesSync(dest, new Date(2026, 8, i), new Date(2026, 8, i));
  }
  const left = readdirSync(stage).sort();
  check(left.length === 14 && left[0] === "Morning brief 2026-09-03.mp3" && left.includes("Morning brief 2026-09-16.mp3"), "keeps only the newest 14 audio copies");
  check(readFileSync(join(stage, "Morning brief 2026-09-16.mp3"), "utf8") === "ID3fake", "the staged file is the brief's audio");
  const mo = readFileSync("src/cos/morning.ts", "utf8");
  const i1 = mo.indexOf("await pingSelf("), i2 = mo.indexOf("sendIMessageFileToSelf(staged)");
  check(i1 > 0 && i2 > i1 && /stageForMessages\(files\.mp3/.test(mo) && /🎧 audio below/.test(mo), "the morning ping is followed by the audio attachment");
  check(/audio attachment failed/.test(mo), "a failed attachment is reported, not silent");
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
