// Command: deep-dive - Ingest all messages and emails for a specific person

import { createHash } from "crypto";
import { MessagesClient } from "../messages/client.js";
import { fetchEmailsBySender } from "../mail/client.js";
import {
  insertItem,
  closeDb,
  type NewMemoryItem,
} from "../storage/index.js";
import {
  getPerson,
  searchPeople,
  getPersonIdentities,
  linkItemToPerson,
} from "../people/repository.js";
import type { Person, PersonIdentity } from "../people/types.js";
import type { EmailMessage } from "../mail/types.js";
import type { Message } from "../messages/types.js";

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function truncate(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function messageToMemoryItem(message: Message): NewMemoryItem {
  const content = `${message.handleId}\n${message.text}`;
  const title = message.isFromMe
    ? `To: ${message.handleId}`
    : `From: ${message.handleId}`;

  return {
    source: "message",
    source_ref: String(message.id),
    occurred_at: message.date.toISOString(),
    title,
    snippet: truncate(message.text || ""),
    raw_hash: computeHash(content),
    metadata_json: JSON.stringify({
      handleId: message.handleId,
      isFromMe: message.isFromMe,
      isRead: message.isRead,
      hasAttachments: message.hasAttachments,
      guid: message.guid,
    }),
  };
}

function emailToMemoryItem(email: EmailMessage): NewMemoryItem {
  const content = `${email.subject}\n${email.from}\n${email.snippet}`;
  return {
    source: "email",
    source_ref: email.id,
    occurred_at: email.date || new Date().toISOString(),
    title: email.subject || "(No subject)",
    snippet: truncate(email.snippet || ""),
    raw_hash: computeHash(content),
    metadata_json: JSON.stringify({
      from: email.from,
      to: email.to,
      account: email.account,
      labels: email.labels,
      threadId: email.threadId,
    }),
  };
}

function printUsage(): void {
  console.log(`
Usage: npm run deep-dive -- <personId_or_name> [--dry-run]

Deep-dive ingests ALL messages and emails for a person by:
  1. Looking up the person and their identities (phone numbers, emails)
  2. Fetching all iMessages (including attributedBody-only messages)
  3. Fetching all emails from Apple Mail
  4. Storing everything in the database and linking to the person

Options:
  --dry-run    Show what would be ingested without writing to database

Examples:
  npm run deep-dive -- em:44b52493d7b74198
  npm run deep-dive -- "Thad"
  npm run deep-dive -- em:44b52493d7b74198 --dry-run
`);
}

/**
 * Resolve a person from an ID or name search.
 */
function resolvePerson(query: string): Person | null {
  // Try direct ID lookup first
  const direct = getPerson(query);
  if (direct) return direct;

  // Try name search
  const results = searchPeople(query, 5);
  if (results.length === 0) {
    console.error(`No person found for: ${query}`);
    return null;
  }
  if (results.length === 1) {
    return results[0];
  }

  // Multiple matches - show them and ask
  console.log(`Multiple matches for "${query}":`);
  for (const p of results) {
    console.log(`  ${p.id}  ${p.display_name}  (${p.primary_email || p.primary_phone || "no contact"})`);
  }
  console.error(`\nPlease use an exact person ID.`);
  return null;
}

/**
 * Collect all phone numbers and emails for a person.
 */
function gatherIdentities(person: Person, identities: PersonIdentity[]): {
  phones: string[];
  emails: string[];
} {
  const phones = new Set<string>();
  const emails = new Set<string>();

  // From primary fields
  if (person.primary_phone) phones.add(person.primary_phone);
  if (person.primary_email) emails.add(person.primary_email.toLowerCase());

  // From identities table
  for (const id of identities) {
    if (id.identity_type === "phone") {
      phones.add(id.identity_value);
    } else if (id.identity_type === "email") {
      emails.add(id.identity_value.toLowerCase());
    }
  }

  return { phones: Array.from(phones), emails: Array.from(emails) };
}

/**
 * For a phone number, try both raw and +1-prefixed formats.
 */
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const variants = new Set<string>();

  variants.add(phone);
  variants.add(digits);

  if (digits.length === 10) {
    variants.add(`+1${digits}`);
    variants.add(`1${digits}`);
  } else if (digits.length === 11 && digits.startsWith("1")) {
    variants.add(`+${digits}`);
    variants.add(digits.slice(1));
  }

  return Array.from(variants);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const query = args.filter((a) => !a.startsWith("--"))[0];

  if (!query) {
    printUsage();
    return;
  }

  // 1. Resolve person
  console.log(`Resolving person: ${query}...`);
  const person = resolvePerson(query);
  if (!person) {
    process.exit(1);
  }

  console.log(`\nPerson: ${person.display_name} (${person.id})`);

  // 2. Gather identities
  const identities = getPersonIdentities(person.id);
  const { phones, emails } = gatherIdentities(person, identities);

  console.log(`\nIdentities found:`);
  console.log(`  Phones: ${phones.length > 0 ? phones.join(", ") : "(none)"}`);
  console.log(`  Emails: ${emails.length > 0 ? emails.join(", ") : "(none)"}`);

  if (phones.length === 0 && emails.length === 0) {
    console.error("\nNo phone or email identities found. Nothing to ingest.");
    process.exit(1);
  }

  const client = new MessagesClient();
  let totalFound = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalLinked = 0;

  // 3. For each phone: fetch all messages (including attributedBody)
  for (const phone of phones) {
    const variants = phoneVariants(phone);
    console.log(`\nFetching iMessages for ${phone}...`);

    for (const variant of variants) {
      // Check total count first
      const count = await client.getTotalMessageCount(variant);
      if (count === 0) continue;

      console.log(`  Handle ${variant}: ${count} total messages`);
      const messages = await client.getAllMessagesForHandle(variant);
      console.log(`  Retrieved ${messages.length} messages`);
      totalFound += messages.length;

      if (dryRun) {
        console.log(`  [dry-run] Would insert ${messages.length} messages`);
        continue;
      }

      for (const msg of messages) {
        if (!msg.text || msg.text.trim() === "") continue;

        const item = messageToMemoryItem(msg);
        const result = insertItem(item);
        if (result.inserted) {
          totalInserted++;
          const linked = linkItemToPerson(result.id, person.id, 0.95, "deep-dive iMessage ingest");
          if (linked) totalLinked++;
        } else {
          totalDuplicates++;
          // Still try to link existing items
          linkItemToPerson(result.id, person.id, 0.95, "deep-dive iMessage ingest");
        }
      }

      // Break after first variant that returns results to avoid double-counting
      break;
    }
  }

  // 4. For each email: fetch from Apple Mail + check iMessage
  for (const email of emails) {
    // Fetch from Apple Mail
    console.log(`\nFetching Apple Mail for ${email}...`);
    const emailMsgs = await fetchEmailsBySender(email);
    console.log(`  Found ${emailMsgs.length} emails`);
    totalFound += emailMsgs.length;

    if (!dryRun) {
      for (const emailMsg of emailMsgs) {
        const item = emailToMemoryItem(emailMsg);
        const result = insertItem(item);
        if (result.inserted) {
          totalInserted++;
          const linked = linkItemToPerson(result.id, person.id, 0.95, "deep-dive email ingest");
          if (linked) totalLinked++;
        } else {
          totalDuplicates++;
          linkItemToPerson(result.id, person.id, 0.95, "deep-dive email ingest");
        }
      }
    } else {
      console.log(`  [dry-run] Would insert ${emailMsgs.length} emails`);
    }

    // Also check iMessage for email-based handles
    console.log(`  Checking iMessages for ${email}...`);
    const iMsgs = await client.getAllMessagesForHandle(email);
    if (iMsgs.length > 0) {
      console.log(`  Found ${iMsgs.length} iMessages via email handle`);
      totalFound += iMsgs.length;

      if (!dryRun) {
        for (const msg of iMsgs) {
          if (!msg.text || msg.text.trim() === "") continue;

          const item = messageToMemoryItem(msg);
          const result = insertItem(item);
          if (result.inserted) {
            totalInserted++;
            const linked = linkItemToPerson(result.id, person.id, 0.95, "deep-dive iMessage ingest");
            if (linked) totalLinked++;
          } else {
            totalDuplicates++;
            linkItemToPerson(result.id, person.id, 0.95, "deep-dive iMessage ingest");
          }
        }
      }
    }
  }

  // 5. Print summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`DEEP DIVE SUMMARY: ${person.display_name}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Total found:    ${totalFound}`);
  if (dryRun) {
    console.log(`  [dry-run] No items written to database`);
  } else {
    console.log(`  Inserted:       ${totalInserted}`);
    console.log(`  Duplicates:     ${totalDuplicates}`);
    console.log(`  Linked:         ${totalLinked}`);
  }
}

main()
  .catch((err) => {
    console.error("Deep dive failed:", err.message || err);
    process.exit(1);
  })
  .finally(() => {
    closeDb();
  });
