// Negative fixture for gate:board-security: no token and any host (what the board must never be).
import * as real from "../../../src/cos/board.ts";
export * from "../../../src/cos/board.ts";
export function createBoardServer(deps: real.BoardDeps, _token: string, port: number) {
  const s = real.createBoardServer(deps, "", port);
  const [h] = s.listeners("request") as ((req: any, res: any) => void)[];
  s.removeAllListeners("request");
  s.on("request", (req: any, res: any) => { req.headers.host = `127.0.0.1:${port}`; delete req.headers["x-cos-token"]; req.url = String(req.url).replace(/([?&])t=[^&]*/, "$1t="); h(req, res); });
  return s;
}
