/**
 * Shared Google API auth, used by both the Gmail client and the Google Tasks client.
 *
 * Reuses the `gws` CLI the user is logged into: `gws auth export --unmasked` yields
 * {client_id, client_secret, refresh_token}, exchanged for a short-lived access token
 * (cached in-process). The same token works for every granted scope — Gmail, Tasks, Calendar.
 */
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GwsCreds {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedCreds: GwsCreds | null = null;

async function loadCreds(): Promise<GwsCreds> {
  if (cachedCreds) return cachedCreds;
  // `--unmasked` is REQUIRED; without it secrets come back masked and the refresh fails.
  const { stdout } = await execFileAsync("gws", ["auth", "export", "--unmasked"], {
    maxBuffer: 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
    throw new Error(
      "gws auth export did not return usable credentials — run `gws auth login` to re-authenticate."
    );
  }
  cachedCreds = parsed;
  return parsed;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const creds = await loadCreds();
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
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
      `Google token refresh failed (${json.error || res.status}). Run \`gws auth login\` to re-authenticate.`
    );
  }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
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
