import {
  PublicClientApplication,
  Configuration,
  AuthenticationResult,
  AccountInfo,
} from "@azure/msal-node";
import { createServer } from "http";
import { URL } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import open from "open";
import {
  OUTLOOK_CLIENT_ID,
  OUTLOOK_CLIENT_SECRET,
  OUTLOOK_TENANT_ID,
  OUTLOOK_SCOPES,
  OUTLOOK_TOKEN_PATH,
  CREDENTIALS_DIR,
} from "../config.js";
import type { OutlookTokenData } from "./types.js";

const REDIRECT_URI = "http://localhost:3001/auth/callback";

let msalClient: PublicClientApplication | null = null;

function getMsalConfig(): Configuration {
  if (!OUTLOOK_CLIENT_ID) {
    throw new Error(
      "OUTLOOK_CLIENT_ID not set. Please add it to your .env file."
    );
  }

  return {
    auth: {
      clientId: OUTLOOK_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID || "common"}`,
      clientSecret: OUTLOOK_CLIENT_SECRET,
    },
    system: {
      loggerOptions: {
        loggerCallback: () => {},
        piiLoggingEnabled: false,
        logLevel: 0,
      },
    },
  };
}

export function getMsalClient(): PublicClientApplication {
  if (!msalClient) {
    msalClient = new PublicClientApplication(getMsalConfig());
  }
  return msalClient;
}

async function saveTokens(tokenData: OutlookTokenData): Promise<void> {
  if (!existsSync(CREDENTIALS_DIR)) {
    await mkdir(CREDENTIALS_DIR, { recursive: true });
  }
  await writeFile(OUTLOOK_TOKEN_PATH, JSON.stringify(tokenData, null, 2));
  console.log("Outlook tokens saved to", OUTLOOK_TOKEN_PATH);
}

async function loadTokens(): Promise<OutlookTokenData | null> {
  if (!existsSync(OUTLOOK_TOKEN_PATH)) {
    return null;
  }
  try {
    const content = await readFile(OUTLOOK_TOKEN_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getAuthCodeFromBrowser(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code");
          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              "<h1>Microsoft Authentication successful!</h1><p>You can close this window.</p>"
            );
            server.close();
            resolve(code);
          } else {
            const error = url.searchParams.get("error");
            const errorDesc = url.searchParams.get("error_description");
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<h1>Authentication failed</h1><p>${error}: ${errorDesc}</p>`
            );
            server.close();
            reject(new Error(`OAuth error: ${error} - ${errorDesc}`));
          }
        }
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3001, () => {
      console.log("Opening browser for Microsoft authentication...");
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

export async function getAccessToken(): Promise<string> {
  const pca = getMsalClient();

  // Try to load existing tokens
  const savedTokens = await loadTokens();

  if (savedTokens?.account) {
    // Try silent token acquisition
    try {
      const accounts = await pca.getTokenCache().getAllAccounts();
      const account = accounts.find(
        (a) => a.homeAccountId === savedTokens.account?.homeAccountId
      );

      if (account) {
        const silentResult = await pca.acquireTokenSilent({
          account,
          scopes: OUTLOOK_SCOPES,
        });

        if (silentResult) {
          await saveTokens({
            accessToken: silentResult.accessToken,
            expiresOn: silentResult.expiresOn?.getTime() || Date.now() + 3600000,
            account: {
              homeAccountId: silentResult.account?.homeAccountId || "",
              environment: silentResult.account?.environment || "",
              username: silentResult.account?.username || "",
            },
          });
          return silentResult.accessToken;
        }
      }
    } catch {
      console.log("Silent token acquisition failed, starting interactive flow...");
    }
  }

  // Need interactive authentication
  const authCodeRequest = {
    scopes: OUTLOOK_SCOPES,
    redirectUri: REDIRECT_URI,
  };

  const authUrl = await pca.getAuthCodeUrl(authCodeRequest);
  const code = await getAuthCodeFromBrowser(authUrl);

  const tokenResponse = await pca.acquireTokenByCode({
    code,
    scopes: OUTLOOK_SCOPES,
    redirectUri: REDIRECT_URI,
  });

  const tokenData: OutlookTokenData = {
    accessToken: tokenResponse.accessToken,
    expiresOn: tokenResponse.expiresOn?.getTime() || Date.now() + 3600000,
    account: tokenResponse.account
      ? {
          homeAccountId: tokenResponse.account.homeAccountId,
          environment: tokenResponse.account.environment,
          username: tokenResponse.account.username,
        }
      : undefined,
  };

  await saveTokens(tokenData);
  return tokenResponse.accessToken;
}

// Run auth flow if this file is executed directly
const isMainModule = process.argv[1]?.includes("outlook/auth");
if (isMainModule) {
  console.log("Starting Microsoft/Outlook authentication flow...");
  getAccessToken()
    .then((token) => {
      console.log("Authentication successful!");
      console.log("Access token obtained (first 20 chars):", token.substring(0, 20) + "...");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Authentication failed:", err.message);
      process.exit(1);
    });
}
