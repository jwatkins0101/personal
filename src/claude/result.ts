/**
 * Extracts the final text result from `claude -p --output-format json` stdout.
 * Older CLIs print one object `{type:"result", result:"..."}`; current CLIs print an
 * array of events whose last `{type:"result"}` entry carries the result (AC-23).
 */
export interface ClaudeRunResult {
  text: string;
  isError: boolean;
  costUsd: number | null;
}

export function parseClaudeJsonOutput(stdout: string): ClaudeRunResult {
  const parsed: unknown = JSON.parse(stdout);
  const events = Array.isArray(parsed) ? parsed : [parsed];
  const result = [...events].reverse().find(
    (e): e is Record<string, unknown> => !!e && typeof e === "object" && (e as { type?: unknown }).type === "result",
  );
  if (!result || typeof result.result !== "string") {
    throw new Error("Claude CLI output has no result event");
  }
  return {
    text: result.result,
    isError: result.is_error === true,
    costUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : null,
  };
}
