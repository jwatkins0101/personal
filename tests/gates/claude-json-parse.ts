// gate:claude-json-parse (AC-23). PARSER_MODULE may point at the legacy parser for negative validation.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const mod = await import(pathToFileURL(resolve(process.env.PARSER_MODULE ?? "src/claude/result.ts")).href);
const parse = mod.parseClaudeJsonOutput as (s: string) => { text: string; isError: boolean; costUsd: number | null };
const fx = (n: string) => readFileSync(`tests/fixtures/claude-cli/${n}`, "utf8");
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const attempt = <T>(f: () => T): T | Error => { try { return f(); } catch (e) { return e as Error; } };

const arr = attempt(() => parse(fx("array-output.json")));
check(!(arr instanceof Error) && JSON.parse(arr.text).classifications[0].id === "sms:1", "current CLI event-array output parses to the final result");
check(!(arr instanceof Error) && typeof arr.costUsd === "number", "cost is read from the result event");
const obj = attempt(() => parse(fx("object-output.json")));
check(!(obj instanceof Error) && obj.text === '{"classifications":[]}', "legacy single-object output still parses");
check(attempt(() => parse(fx("no-result-output.json"))) instanceof Error, "output without a result event is rejected");
const src = readFileSync("src/classifier/index.ts", "utf8");
check(/parseClaudeJsonOutput\(stdout\)/.test(src), "classifier uses the shared parser");
process.exit(fail);
