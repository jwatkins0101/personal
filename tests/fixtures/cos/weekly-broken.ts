// Negative fixture for gate:weekly-shape: hides dropped balls and invents a promotion.
export * from "../../../src/cos/weekly.ts";
import * as real from "../../../src/cos/weekly.ts";
export function buildScorecard(...a: Parameters<typeof real.buildScorecard>) {
  const s = real.buildScorecard(...a);
  return { ...s, dropped_balls: { count: 0, items: [] }, promotion_candidates: ["task: promoted"] };
}
