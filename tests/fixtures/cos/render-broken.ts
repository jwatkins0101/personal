// Negative fixture for gate:brief-shape: never produces audio and drops the Escalations section.
import * as real from "../../../src/cos/render.ts";
export const SECTION_ORDER = real.SECTION_ORDER;
export function writeBrief(b: real.Brief, dir: string) {
  process.env.COS_NO_AUDIO = "1";
  return real.writeBrief({ ...b, escalations: [] }, dir);
}
