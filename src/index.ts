import {
  fetchUnreadEmails,
  processEmailAction,
  markAsRead,
  loadLabels,
} from "./mail/client.js";
import { invokeClaudeForClassification } from "./claude/invoke.js";
import type { EmailMessage, EmailClassification } from "./mail/types.js";
import { ARCHIVE_CATEGORIES } from "./mail/types.js";

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting email processing...`);
  console.log("Provider: Gmail (gws)");
  console.log("=".repeat(50));

  try {
    // Fetch unread emails from Apple Mail
    console.log("Fetching unread emails...");
    const emails = await fetchUnreadEmails();

    if (emails.length === 0) {
      console.log("No unread emails to process.");
      return;
    }

    console.log(`Found ${emails.length} unread email(s).`);

    // Log email subjects for visibility
    emails.forEach((e, i) => {
      const account = e.account ? ` [${e.account}]` : "";
      console.log(`  ${i + 1}.${account} [${e.from}] ${e.subject}`);
    });

    // Invoke Claude to classify emails
    console.log("\nClassifying emails with Claude...");
    const classifications = await invokeClaudeForClassification(emails);

    // Process each classification
    console.log("\nApplying actions...");
    for (const classification of classifications) {
      const email = emails.find((e) => e.id === classification.id);
      if (!email) {
        console.warn(`Email not found for ID: ${classification.id}`);
        continue;
      }

      const shouldArchive = ARCHIVE_CATEGORIES.includes(classification.category);
      const actionText = shouldArchive ? "archive" : "keep in inbox";

      console.log(
        `  - "${email.subject.substring(0, 40)}..." → ${classification.category} (${actionText})`
      );
      if (classification.reason) {
        console.log(`    Reason: ${classification.reason}`);
      }

      try {
        // Apply flag and optionally archive
        await processEmailAction(
          classification.id,
          classification.category,
          shouldArchive
        );

        // Mark as read if archived
        if (shouldArchive) {
          await markAsRead(classification.id);
        }
      } catch (err) {
        console.error(
          `  Failed to process email ${classification.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(`\nProcessed ${classifications.length} email(s).`);

    // Summary
    const archived = classifications.filter((c) =>
      ARCHIVE_CATEGORIES.includes(c.category)
    ).length;
    const kept = classifications.length - archived;
    console.log(`Summary: ${archived} archived, ${kept} kept in inbox.`);
  } catch (err) {
    console.error("Error processing emails:", err);
    process.exit(1);
  }
}

main();
