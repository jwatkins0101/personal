/**
 * Shared Google API auth, used by both the Gmail client and the Google Tasks client.
 *
 * Reuses the `gws` CLI the user is logged into: `gws auth export --unmasked` yields
 * {client_id, client_secret, refresh_token}, exchanged for a short-lived access token
 * (cached in-process). The same token works for every granted scope — Gmail, Tasks, Calendar.
 *
 * Multiple accounts (D23): each Google account has its own gws profile dir (cos/accounts.json).
 * `withAccount(id, fn)` runs fn "as" that account; every Gmail/Tasks call inside uses its
 * credentials. Outside withAccount the default account (personal) is used, as before.
 */
import { execFile } from "child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "util";

const accountStore = new AsyncLocalStorage<string>();
export const DEFAULT_ACCOUNT = "personal";

/** Runs fn with Google API calls authenticated as the given account profile. */
export function withAccount<T>(account: string | undefined, fn: () => Promise<T>): Promise<T> {
  return accountStore.run(account || DEFAULT_ACCOUNT, fn);
}
export function currentAccount(): string { return accountStore.getStore() ?? DEFAULT_ACCOUNT; }

const ACCOUNTS_PATH = process.env.COS_ACCOUNTS_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../cos/accounts.json");
/** gws config dir for an account id; undefined = gws default dir. */
export function configDirFor(account: string): string | undefined {
  if (account === DEFAULT_ACCOUNT) return undefined;
  const list = (JSON.parse(readFileSync(ACCOUNTS_PATH, "utf8")) as { accounts: { id: string; config_dir: string }[] }).accounts;
  const a = list.find((x) => x.id === account);
  if (!a) throw new Error(`Unknown Google account profile "${account}" (see cos/accounts.json).`);
  return a.config_dir.replace(/^~(?=\/|$)/, homedir());
}

const execFileAsync = promisify(execFile);
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GwsCreds {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

const tokens = new Map<string, { value: string; expiresAt: number }>();
const creds = new Map<string, GwsCreds>();

/** Credentials for one account, read from its gws profile. */
export async function credsFor(account: string): Promise<GwsCreds> {
  const hit = creds.get(account);
  if (hit) return hit;
  const dir = configDirFor(account);
  // `--unmasked` is REQUIRED; without it secrets come back masked and the refresh fails.
  const { stdout } = await execFileAsync("gws", ["auth", "export", "--unmasked"], {
    maxBuffer: 1024 * 1024,
    env: dir ? { ...process.env, GOOGLE_WORKSPACE_CLI_CONFIG_DIR: dir } : process.env,
  });
  const parsed = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
    throw new Error(
      `gws auth export did not return usable credentials for "${account}". Run: scripts/gws-login.sh ${account}`
    );
  }
  creds.set(account, parsed);
  return parsed;
}

export async function getAccessToken(account = currentAccount()): Promise<string> {
  const cached = tokens.get(account);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.value;
  }
  const c = await credsFor(account);
  const body = new URLSearchParams({
    client_id: c.client_id,
    client_secret: c.client_secret,
    refresh_token: c.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) {
    throw new Error(
      `Google token refresh failed for "${account}" (${json.error || res.status}). Run: scripts/gws-login.sh ${account}`
    );
  }
  tokens.set(account, {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() against any Google API with bearer auth + transparent 429/403-quota backoff. */
export async function authedFetch(url: string, init: RequestInit = {}, tries = 0): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if ((res.status === 429 || res.status === 403) && tries < 5) {
    await sleep(2000 * (tries + 1));
    return authedFetch(url, init, tries + 1);
  }
  return res;
}

/** Whether `gws` can currently produce a Google token (used for preflight checks). */
export async function isAuthed(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
