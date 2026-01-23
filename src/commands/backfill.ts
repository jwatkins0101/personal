// Command: backfill - Import historical emails to match with people

import { fetchEmailsForBackfill } from "../mail/client.js";
import { closeDb, insertItem, getItem } from "../storage/index.js";
import { linkItemToMatchedPerson, extractEmails } from "../people/index.js";
import { createHash } from "crypto";
import type { MemoryItem } from "../storage/types.js";

function printUsage(): void {
  console.log(`
Usage: npm run backfill -- [options]

Options:
  --count <n>     Number of emails to fetch (default: 500)
  --mailbox <m>   Which mailbox: inbox, sent, all (default: all)
  --dry-run       Show what would be imported without importing

Examples:
  npm run backfill
  npm run backfill -- --count 1000
  npm run backfill -- --mailbox sent
  npm run backfill -- --dry-run
`);
}

function emailToMemoryItem(email: {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  account?: string;
  labels?: string[];
}): MemoryItem {
  const content = `${email.subject}\n${email.snippet}`;
  const rawHash = createHash("sha256").update(content).digest("hex");

  return {
    id: `email:${email.id}`,
    source: "email",
    source_ref: email.id,
    ingested_at: new Date().toISOString(),
    occurred_at: email.date || new Date().toISOString(),
    title: email.subject || "(No subject)",
    summary: null,
    snippet: email.snippet || "",
    raw_hash: rawHash,
    category: null,
    priority: null,
    confidence: null,
    reason: null,
    suggested_actions_json: null,
    status: "processed", // Mark as processed since these are historical
    route: null,
    metadata_json: JSON.stringify({
      from: email.from,
      account: email.account,
      backfill: true,
    }),
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  // Parse arguments
  let count = 500;
  let mailbox: "inbox" | "sent" | "all" = "inbox"; // Default to inbox (fastest)
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--mailbox" && args[i + 1]) {
      mailbox = args[i + 1] as "inbox" | "sent" | "all";
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("EMAIL BACKFILL");
  console.log("=".repeat(50));
  console.log(`\nFetching up to ${count} emails from ${mailbox}...`);

  try {
    const emails = await fetchEmailsForBackfill(count, mailbox);

    if (emails.length === 0) {
      console.log("\nNo emails found. Make sure Mail.app is running.");
      return;
    }

    console.log(`Found ${emails.length} emails\n`);

    let imported = 0;
    let skipped = 0;
    let linked = 0;
    const senderCounts = new Map<string, number>();

    for (const email of emails) {
      // Track sender
      const sender = email.from.toLowerCase();
      senderCounts.set(sender, (senderCounts.get(sender) || 0) + 1);

      if (dryRun) {
        continue;
      }

      const itemId = `email:${email.id}`;

      // Check if already exists
      const existing = getItem(itemId);
      if (existing) {
        skipped++;
        // Still try to link to person if not already linked
        const linkedPerson = linkItemToMatchedPerson(itemId, { email: email.from });
        if (linkedPerson) {
          linked++;
        }
        continue;
      }

      // Insert the email
      const item = emailToMemoryItem(email);
      const result = insertItem(item);

      if (result.inserted) {
        imported++;
        // Link to person
        const linkedPerson = linkItemToMatchedPerson(itemId, { email: email.from });
        if (linkedPerson) {
          linked++;
        }
      } else {
        skipped++;
      }
    }

    if (dryRun) {
      console.log("--- Dry Run Results ---");
      console.log(`  Emails found: ${emails.length}`);
      console.log(`  Unique senders: ${senderCounts.size}`);
      console.log("\nTop senders:");
      const topSenders = [...senderCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      for (const [sender, senderCount] of topSenders) {
        console.log(`  ${sender}: ${senderCount} emails`);
      }
    } else {
      console.log("--- Import Results ---");
      console.log(`  Emails imported: ${imported}`);
      console.log(`  Emails skipped (already exist): ${skipped}`);
      console.log(`  Linked to people: ${linked}`);
      console.log(`  Unique senders: ${senderCounts.size}`);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err.message);
  closeDb();
  process.exit(1);
});
