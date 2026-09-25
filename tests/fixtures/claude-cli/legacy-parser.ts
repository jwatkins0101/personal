// Pre-AC-23 behavior (object-only), used for negative validation of gate:claude-json-parse.
export function parseClaudeJsonOutput(stdout: string) {
  const response = JSON.parse(stdout);
  if (!response.result) throw new Error("no result");
  return { text: response.result as string, isError: false, costUsd: null };
}
