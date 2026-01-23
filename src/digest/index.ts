import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { fetchUnreadEmails } from "../mail/client.js";
import { generateDigest } from "./generator.js";
import {
  formatDigestConsole,
  formatDigestMarkdown,
  formatDigestHtml,
} from "./formatter.js";
import type { DigestOptions } from "./types.js";
import { PROJECT_ROOT } from "../config.js";

function parseArgs(): { format: DigestOptions["outputFormat"]; output?: string } {
  const args = process.argv.slice(2);

  let format: DigestOptions["outputFormat"] = "console";
  let output: string | undefined;

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

  return { format, output };
}

async function main(): Promise<void> {
  const { format, output } = parseArgs();

  console.log(`[${new Date().toISOString()}] Generating daily digest...`);
  console.log(`Provider: Apple Mail, Format: ${format}`);

  try {
    // Fetch emails from Apple Mail
    console.log("Fetching unread emails from Apple Mail...");
    const emails = await fetchUnreadEmails();
    console.log(`Fetched ${emails.length} emails`);

    // Generate digest
    const digest = await generateDigest(emails, {
      provider: "all", // Not used anymore but kept for compatibility
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
        await mkdir(digestsDir, { recursive: true });
        await writeFile(outputPath, formattedOutput);
        console.log(`\nDigest saved to: ${outputPath}`);
      } catch {
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
