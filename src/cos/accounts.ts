/**
 * Google account profiles (D20). Each account gets its own gws config dir (GOOGLE_WORKSPACE_CLI_CONFIG_DIR),
 * so logging into one never replaces another. `npm run cos -- accounts` verifies which account each
 * profile is really signed into (the wrong-account mistake has bitten before).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const ACCOUNTS_PATH = process.env.COS_ACCOUNTS_PATH ?? resolve(REPO_ROOT, "cos/accounts.json");

export interface Account { id: string; email: string | null; domain?: string; config_dir: string; default?: boolean }
export interface AccountsFile { scopes: string[]; accounts: Account[]; not_google: { id: string; email: string; provider: string; note: string }[] }

export const expandHome = (p: string) => p.replace(/^~(?=\/|$)/, homedir());
export function loadAccounts(): AccountsFile { return JSON.parse(readFileSync(ACCOUNTS_PATH, "utf8")) as AccountsFile; }

/** Environment that points gws at one account's profile. */
export function gwsEnv(a: Account): NodeJS.ProcessEnv {
  return { ...process.env, GOOGLE_WORKSPACE_CLI_CONFIG_DIR: expandHome(a.config_dir) };
}

export function loginCommand(a: Account, scopes: string[]): string {
  return `GOOGLE_WORKSPACE_CLI_CONFIG_DIR="${a.config_dir.replace(/^~/, "$HOME")}" gws auth login --scopes "${scopes.join(",")}"`;
}

export interface AccountCheck { id: string; expected: string | null; signed_in_as: string | null; state: "ok" | "needs_login" | "wrong_account" | "error"; detail?: string }

export function checkAccount(a: Account): AccountCheck {
  const dir = expandHome(a.config_dir);
  const expected = a.email ?? (a.domain ? `*@${a.domain}` : null);
  if (!existsSync(`${dir}/credentials.enc`)) return { id: a.id, expected, signed_in_as: null, state: "needs_login" };
  const r = spawnSync("gws", ["gmail", "users", "getProfile", "--params", '{"userId":"me"}'], { env: gwsEnv(a), encoding: "utf8", timeout: 30_000 });
  if (r.status !== 0) return { id: a.id, expected, signed_in_as: null, state: "error", detail: (r.stderr || r.stdout).trim().slice(0, 160) };
  let email: string | null = null;
  try { email = (JSON.parse(r.stdout) as { emailAddress?: string }).emailAddress ?? null; } catch { /* leave null */ }
  const want = a.email?.toLowerCase();
  const ok = email && (want ? email.toLowerCase() === want : a.domain ? email.toLowerCase().endsWith(`@${a.domain}`) : true);
  return { id: a.id, expected, signed_in_as: email, state: ok ? "ok" : "wrong_account" };
}
