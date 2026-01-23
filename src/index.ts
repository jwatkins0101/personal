import {
  fetchUnreadEmails as fetchGmailEmails,
  processEmailAction as processGmailAction,
  markAsRead as markGmailAsRead,
  loadLabels as loadGmailLabels,
} from "./gmail/client.js";
import {
  fetchUnreadEmails as fetchOutlookEmails,
  processEmailAction as processOutlookAction,
  markAsRead as markOutlookAsRead,
  loadLabels as loadOutlookLabels,
} from "./outlook/client.js";
import { invokeClaudeForClassification } from "./claude/invoke.js";
import type { EmailMessage, EmailClassification } from "./gmail/types.js";
import type { IEmailProvider } from "./providers/types.js";

type ProviderName = "gmail" | "outlook" | "all";

// Create provider implementations
const gmailProvider: IEmailProvider = {
  name: "gmail",
  fetchUnreadEmails: fetchGmailEmails,
  processEmailAction: processGmailAction,
  markAsRead: markGmailAsRead,
  loadLabels: loadGmailLabels,
};

const outlookProvider: IEmailProvider = {
  name: "outlook",
  fetchUnreadEmails: fetchOutlookEmails,
  processEmailAction: processOutlookAction,
  markAsRead: markOutlookAsRead,
  loadLabels: loadOutlookLabels,
};

function parseArgs(): ProviderName {
  const args = process.argv.slice(2);
  const providerIndex = args.indexOf("--provider");

  if (providerIndex !== -1 && args[providerIndex + 1]) {
    const provider = args[providerIndex + 1].toLowerCase();
    if (provider === "gmail" || provider === "outlook" || provider === "all") {
      return provider;
    }
  }

  // Default to Gmail for backward compatibility
  return "gmail";
}

function getProviders(providerName: ProviderName): IEmailProvider[] {
  switch (providerName) {
    case "gmail":
      return [gmailProvider];
    case "outlook":
      return [outlookProvider];
    case "all":
      return [gmailProvider, outlookProvider];
  }
}

async function processProvider(provider: IEmailProvider): Promise<{
  processed: number;
  archived: number;
  kept: number;
}> {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Processing ${provider.name.toUpperCase()} emails...`);
  console.log("=".repeat(50));

  // Pre-load labels/categories
  await provider.loadLabels();

  // Fetch unread emails
  console.log("Fetching unread emails...");
  const emails = await provider.fetchUnreadEmails();

  if (emails.length === 0) {
    console.log("No unread emails to process.");
    return { processed: 0, archived: 0, kept: 0 };
  }

  console.log(`Found ${emails.length} unread email(s).`);

  // Log email subjects for visibility
  emails.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.from}] ${e.subject}`);
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

    const shouldArchive = classification.action === "archive";
    const actionText = shouldArchive ? "archive" : "keep in inbox";

    console.log(
      `  - "${email.subject.substring(0, 40)}..." → ${classification.category} (${actionText})`
    );
    if (classification.reason) {
      console.log(`    Reason: ${classification.reason}`);
    }

    try {
      // Apply label/category and optionally archive
      await provider.processEmailAction(
        classification.id,
        classification.label,
        shouldArchive
      );

      // Mark as read if archived
      if (shouldArchive) {
        await provider.markAsRead(classification.id);
      }
    } catch (err) {
      console.error(
        `  Failed to process email ${classification.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const archived = classifications.filter(
    (c) => c.action === "archive"
  ).length;
  const kept = classifications.length - archived;

  return { processed: classifications.length, archived, kept };
}

async function main(): Promise<void> {
  const providerName = parseArgs();
  const providers = getProviders(providerName);

  console.log(`[${new Date().toISOString()}] Starting email processing...`);
  console.log(`Provider(s): ${providers.map((p) => p.name).join(", ")}`);

  let totalProcessed = 0;
  let totalArchived = 0;
  let totalKept = 0;

  try {
    for (const provider of providers) {
      try {
        const result = await processProvider(provider);
        totalProcessed += result.processed;
        totalArchived += result.archived;
        totalKept += result.kept;
      } catch (err) {
        console.error(
          `\nError processing ${provider.name}:`,
          err instanceof Error ? err.message : err
        );
        // Continue with other providers even if one fails
      }
    }

    // Overall summary
    console.log(`\n${"=".repeat(50)}`);
    console.log("OVERALL SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total processed: ${totalProcessed} email(s)`);
    console.log(`Archived: ${totalArchived}, Kept in inbox: ${totalKept}`);
  } catch (err) {
    console.error("Error processing emails:", err);
    process.exit(1);
  }
}

main();
