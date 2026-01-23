import { writeFile } from "fs/promises";
import { join } from "path";
import {
  fetchUnreadEmails as fetchGmailEmails,
  loadLabels as loadGmailLabels,
} from "../gmail/client.js";
import {
  fetchUnreadEmails as fetchOutlookEmails,
  loadLabels as loadOutlookLabels,
} from "../outlook/client.js";
import { generateDigest } from "./generator.js";
import {
  formatDigestConsole,
  formatDigestMarkdown,
  formatDigestHtml,
} from "./formatter.js";
import type { DigestOptions } from "./types.js";
import { PROJECT_ROOT } from "../config.js";

type ProviderName = "gmail" | "outlook" | "all";

function parseArgs(): { provider: ProviderName; format: DigestOptions["outputFormat"]; output?: string } {
  const args = process.argv.slice(2);

  let provider: ProviderName = "gmail";
  let format: DigestOptions["outputFormat"] = "console";
  let output: string | undefined;

  const providerIndex = args.indexOf("--provider");
  if (providerIndex !== -1 && args[providerIndex + 1]) {
    const p = args[providerIndex + 1].toLowerCase();
    if (p === "gmail" || p === "outlook" || p === "all") {
      provider = p;
    }
  }

  const formatIndex = args.indexOf("--format");
  if (formatIndex !== -1 && args[formatIndex + 1]) {
    const f = args[formatIndex + 1].toLowerCase();
    if (f === "console" || f === "markdown" || f === "html") {
      format = f;
    }
  }

  const outputIndex = args.indexOf("--output");
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    output = args[outputIndex + 1];
  }

  return { provider, format, output };
}

async function main(): Promise<void> {
  const { provider, format, output } = parseArgs();

  console.log(`[${new Date().toISOString()}] Generating daily digest...`);
  console.log(`Provider: ${provider}, Format: ${format}`);

  try {
    // Fetch emails from selected provider(s)
    let allEmails: Awaited<ReturnType<typeof fetchGmailEmails>> = [];

    if (provider === "gmail" || provider === "all") {
      try {
        await loadGmailLabels();
        const gmailEmails = await fetchGmailEmails();
        console.log(`Fetched ${gmailEmails.length} emails from Gmail`);
        allEmails = [...allEmails, ...gmailEmails];
      } catch (err) {
        console.error("Failed to fetch Gmail emails:", err instanceof Error ? err.message : err);
      }
    }

    if (provider === "outlook" || provider === "all") {
      try {
        await loadOutlookLabels();
        const outlookEmails = await fetchOutlookEmails();
        console.log(`Fetched ${outlookEmails.length} emails from Outlook`);
        allEmails = [...allEmails, ...outlookEmails];
      } catch (err) {
        console.error("Failed to fetch Outlook emails:", err instanceof Error ? err.message : err);
      }
    }

    if (allEmails.length === 0) {
      console.log("No emails to process.");
      return;
    }

    // Generate digest
    const digest = await generateDigest(allEmails, {
      provider,
      outputFormat: format,
    });

    // Format output
    let formattedOutput: string;
    let fileExtension: string;

    switch (format) {
      case "markdown":
        formattedOutput = formatDigestMarkdown(digest);
        fileExtension = "md";
        break;
      case "html":
        formattedOutput = formatDigestHtml(digest);
        fileExtension = "html";
        break;
      default:
        formattedOutput = formatDigestConsole(digest);
        fileExtension = "txt";
    }

    // Output
    if (output) {
      const outputPath = output.startsWith("/") ? output : join(PROJECT_ROOT, output);
      await writeFile(outputPath, formattedOutput);
      console.log(`\nDigest saved to: ${outputPath}`);
    } else if (format === "html" || format === "markdown") {
      // Auto-save to digests folder for non-console formats
      const timestamp = new Date().toISOString().split("T")[0];
      const digestsDir = join(PROJECT_ROOT, "digests");
      const outputPath = join(digestsDir, `digest-${timestamp}.${fileExtension}`);

      try {
        const { mkdir } = await import("fs/promises");
        await mkdir(digestsDir, { recursive: true });
        await writeFile(outputPath, formattedOutput);
        console.log(`\nDigest saved to: ${outputPath}`);
      } catch (err) {
        console.log("\n" + formattedOutput);
      }
    } else {
      console.log("\n" + formattedOutput);
    }

  } catch (err) {
    console.error("Error generating digest:", err);
    process.exit(1);
  }
}

main();
