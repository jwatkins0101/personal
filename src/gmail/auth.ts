import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "http";
import { URL } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import open from "open";
import {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  SCOPES,
  TOKEN_PATH,
  CREDENTIALS_DIR,
  GOOGLE_CREDENTIALS_PATH,
} from "../config.js";
import type { TokenData } from "./types.js";

const REDIRECT_URI = "http://localhost:3000/oauth2callback";

async function loadCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  // First try environment variables
  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET) {
    return {
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
    };
  }

  // Then try credentials file
  if (existsSync(GOOGLE_CREDENTIALS_PATH)) {
    const content = await readFile(GOOGLE_CREDENTIALS_PATH, "utf-8");
    const credentials = JSON.parse(content);
    const { client_id, client_secret } =
      credentials.installed || credentials.web;
    return { clientId: client_id, clientSecret: client_secret };
  }

  throw new Error(
    "No credentials found. Either set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET " +
      "in .env, or place google-credentials.json in the credentials/ folder."
  );
}

export async function createOAuth2Client(): Promise<OAuth2Client> {
  const { clientId, clientSecret } = await loadCredentials();

  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

async function saveTokens(tokens: TokenData): Promise<void> {
  if (!existsSync(CREDENTIALS_DIR)) {
    await mkdir(CREDENTIALS_DIR, { recursive: true });
  }
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("Tokens saved to", TOKEN_PATH);
}

async function loadTokens(): Promise<TokenData | null> {
  if (!existsSync(TOKEN_PATH)) {
    return null;
  }
  const content = await readFile(TOKEN_PATH, "utf-8");
  return JSON.parse(content);
}

async function getAuthCodeFromBrowser(
  authUrl: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        if (url.pathname === "/oauth2callback") {
          const code = url.searchParams.get("code");
          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              "<h1>Authentication successful!</h1><p>You can close this window.</p>"
            );
            server.close();
            resolve(code);
          } else {
            const error = url.searchParams.get("error");
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h1>Authentication failed</h1><p>${error}</p>`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
          }
        }
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log("Opening browser for authentication...");
      console.log("If browser doesn't open, visit:", authUrl);
      open(authUrl).catch(() => {
        // If open fails, user will use the URL manually
      });
    });

    server.on("error", reject);

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out"));
    }, 5 * 60 * 1000);
  });
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const oauth2Client = await createOAuth2Client();

  // Try to load existing tokens
  const tokens = await loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

    // Check if token needs refresh
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      console.log("Token expired, refreshing...");
      const { credentials } = await oauth2Client.refreshAccessToken();
      await saveTokens(credentials as TokenData);
      oauth2Client.setCredentials(credentials);
    }

    return oauth2Client;
  }

  // No tokens, need to authenticate
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  const code = await getAuthCodeFromBrowser(authUrl);
  const { tokens: newTokens } = await oauth2Client.getToken(code);
  await saveTokens(newTokens as TokenData);
  oauth2Client.setCredentials(newTokens);

  return oauth2Client;
}

// Run auth flow if this file is executed directly
const isMainModule = process.argv[1]?.includes("auth");
if (isMainModule) {
  console.log("Starting Gmail authentication flow...");
  getAuthenticatedClient()
    .then(() => {
      console.log("Authentication successful!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Authentication failed:", err.message);
      process.exit(1);
    });
}
