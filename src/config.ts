import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const PROJECT_ROOT = join(__dirname, "..");

export const CREDENTIALS_DIR = join(PROJECT_ROOT, "credentials");
export const TOKEN_PATH = join(CREDENTIALS_DIR, "token.json");
export const GOOGLE_CREDENTIALS_PATH = join(
  CREDENTIALS_DIR,
  "google-credentials.json"
);

// Gmail configuration
export const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
export const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

// Outlook/Microsoft 365 configuration
export const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
export const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
export const OUTLOOK_TENANT_ID = process.env.OUTLOOK_TENANT_ID || "common";
export const OUTLOOK_TOKEN_PATH = join(CREDENTIALS_DIR, "outlook-token.json");
export const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/User.Read",
];

// General configuration
export const MAX_EMAILS_PER_RUN = parseInt(
  process.env.MAX_EMAILS_PER_RUN || "20",
  10
);

// Gmail API scopes needed
export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

// Label prefixes
export const LABEL_PREFIX = "auto";

// Category to label mapping
export const CATEGORY_LABELS: Record<string, string> = {
  newsletter: `${LABEL_PREFIX}/newsletters`,
  receipt: `${LABEL_PREFIX}/receipts`,
  social: `${LABEL_PREFIX}/social`,
  work: `${LABEL_PREFIX}/important`,
  important: `${LABEL_PREFIX}/important`,
  spam: `${LABEL_PREFIX}/spam`,
  uncategorized: `${LABEL_PREFIX}/needs-review`,
};

// Categories that should be archived (removed from inbox)
export const ARCHIVE_CATEGORIES = [
  "newsletter",
  "receipt",
  "social",
  "spam",
];
