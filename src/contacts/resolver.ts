/**
 * Resolve iMessage/SMS handles (phone numbers, emails) to contact names by reading the macOS
 * Contacts (AddressBook) databases. chat.db only stores the raw handle; names live in Contacts.
 *
 * DB locations default to ~/Library/Application Support/AddressBook/Sources/<uuid>/AddressBook-v22.abcddb
 * (multiple sources = iCloud, Google, On-My-Mac…). Override with the CONTACTS_DBS env var
 * (colon-separated paths) so a scheduled job can point at temp copies that dodge macOS TCC.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const execFileAsync = promisify(execFile);

function contactDbPaths(): string[] {
  const override = process.env.CONTACTS_DBS;
  if (override) return override.split(":").filter(Boolean);
  const sourcesDir = `${homedir()}/Library/Application Support/AddressBook/Sources`;
  try {
    return readdirSync(sourcesDir)
      .map((uuid) => join(sourcesDir, uuid, "AddressBook-v22.abcddb"))
      .filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

/** Normalize a phone/email handle to a match key: emails lowercased; phones → last 10 digits. */
export function handleKey(handle: string): string {
  const h = handle.trim();
  if (h.includes("@")) return h.toLowerCase();
  const digits = h.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

interface ContactIndex {
  byKey: Map<string, string>;
}

let cached: ContactIndex | null = null;

async function querySqlite(dbPath: string, sql: string): Promise<string[][]> {
  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-readonly", "-separator", "\t", dbPath, sql],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    return stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => l.split("\t"));
  } catch {
    return [];
  }
}

/** Build (once) a lookup from normalized phone/email → display name across all Contacts sources. */
export async function loadContactIndex(): Promise<ContactIndex> {
  if (cached) return cached;
  const byKey = new Map<string, string>();

  for (const db of contactDbPaths()) {
    // phones
    const phones = await querySqlite(
      db,
      `SELECT p.ZFULLNUMBER, trim(coalesce(r.ZFIRSTNAME,'')||' '||coalesce(r.ZLASTNAME,'')||
        case when r.ZORGANIZATION is not null and r.ZFIRSTNAME is null and r.ZLASTNAME is null
             then r.ZORGANIZATION else '' end)
       FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON p.ZOWNER=r.Z_PK
       WHERE p.ZFULLNUMBER IS NOT NULL;`
    );
    for (const [num, name] of phones) {
      const key = handleKey(num);
      if (key && name && name.trim() && !byKey.has(key)) byKey.set(key, name.trim());
    }
    // emails
    const emails = await querySqlite(
      db,
      `SELECT e.ZADDRESS, trim(coalesce(r.ZFIRSTNAME,'')||' '||coalesce(r.ZLASTNAME,''))
       FROM ZABCDEMAILADDRESS e JOIN ZABCDRECORD r ON e.ZOWNER=r.Z_PK
       WHERE e.ZADDRESS IS NOT NULL;`
    );
    for (const [addr, name] of emails) {
      const key = handleKey(addr);
      if (key && name && name.trim() && !byKey.has(key)) byKey.set(key, name.trim());
    }
  }

  cached = { byKey };
  return cached;
}

/** Resolve a handle to a contact name, or undefined if unknown. */
export async function resolveName(handle: string): Promise<string | undefined> {
  const idx = await loadContactIndex();
  return idx.byKey.get(handleKey(handle));
}

/** Resolve to a friendly label: the contact name if known, else the raw handle. */
export async function nameOrHandle(handle: string): Promise<string> {
  return (await resolveName(handle)) || handle;
}
