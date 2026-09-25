// Negative fixture for gate:board-live: serves the first state forever (not live).
import * as real from "../../../src/cos/board.ts";
export * from "../../../src/cos/board.ts";
export function createBoardServer(...a: Parameters<typeof real.createBoardServer>) {
  const s = real.createBoardServer(...a);
  const [h] = s.listeners("request") as ((req: any, res: any) => void)[];
  s.removeAllListeners("request");
  let cached: unknown = null;
  s.on("request", (req: any, res: any) => {
    if (String(req.url).startsWith("/api/state")) {
      if (cached) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(cached); }
      const end = res.end.bind(res); res.end = (b: unknown) => { cached = b; return end(b); };
    }
    h(req, res);
  });
  return s;
}
