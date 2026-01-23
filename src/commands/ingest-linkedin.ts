// Command: ingest:linkedin - Import LinkedIn export data

import { existsSync, statSync, readdirSync } from "fs";
import { join, extname, basename, dirname } from "path";
import { execSync } from "child_process";
import { closeDb } from "../storage/db.js";
import {
  importConnections,
  importMessages,
  importLinkedInExport,
} from "../linkedin/index.js";
import {
  getPeopleCount,
  getLinkedInConnectionCount,
} from "../people/index.js";

function printUsage(): void {
  console.log(`
Usage: npm run ingest:linkedin -- <path> [options]

Arguments:
  <path>    Path to LinkedIn export (directory or zip file)

Options:
  --file <path>    Alias for path argument
  --since <date>   Only import connections from this date (YYYY-MM-DD)
  --force          Re-import even if file was already processed

Examples:
  npm run ingest:linkedin -- ~/Downloads/LinkedInExport/
  npm run ingest:linkedin -- ~/Downloads/Basic_LinkedInDataExport.zip
  npm run ingest:linkedin -- --file ~/Downloads/Connections.csv
  npm run ingest:linkedin -- ~/Downloads/Connections.csv --since 2025-01-01
`);
}

function extractZip(zipPath: string): string {
  const targetDir = `/tmp/linkedin_export_${Date.now()}`;
  execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: "pipe" });
  return targetDir;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  // Parse arguments
  let inputPath: string | null = null;
  let since: string | undefined;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--file" && args[i + 1]) {
      inputPath = args[++i];
    } else if (arg === "--since" && args[i + 1]) {
      since = args[++i];
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("-")) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    console.error("Error: No input path provided");
    printUsage();
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: Path not found: ${inputPath}`);
    process.exit(1);
  }

  console.log("LinkedIn Data Import");
  console.log("=".repeat(50));

  try {
    const stats = statSync(inputPath);
    let workDir = inputPath;

    // Handle zip files
    if (stats.isFile() && (inputPath.endsWith(".zip") || inputPath.includes(".zip"))) {
      console.log(`\nExtracting zip file...`);
      workDir = extractZip(inputPath);
      console.log(`  Extracted to: ${workDir}`);
    }

    // Determine what to import
    if (stats.isFile() && inputPath.endsWith(".csv")) {
      // Single CSV file
      const fileName = basename(inputPath).toLowerCase();

      if (fileName === "connections.csv") {
        console.log("\nImporting Connections.csv...");
        const result = await importConnections(inputPath, { since, force });
        printConnectionStats(result);
      } else if (fileName === "messages.csv") {
        console.log("\nImporting messages.csv...");
        const result = await importMessages(inputPath, { force });
        printMessageStats(result);
      } else {
        console.error(`Unknown CSV file: ${fileName}`);
        console.log("Supported files: Connections.csv, messages.csv");
        process.exit(1);
      }
    } else {
      // Directory - import all supported files
      console.log(`\nImporting from directory: ${workDir}`);
      const results = await importLinkedInExport(workDir, { since, force });

      if (results.connections) {
        printConnectionStats(results.connections);
      }
      if (results.messages) {
        printMessageStats(results.messages);
      }

      if (!results.connections && !results.messages) {
        console.log("\nNo importable files found in directory.");
        console.log("Looking for: Connections.csv, messages.csv");
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("Database Summary");
    console.log("=".repeat(50));
    console.log(`  Total people: ${getPeopleCount()}`);
    console.log(`  LinkedIn connections: ${getLinkedInConnectionCount()}`);

  } catch (err) {
    console.error("\nImport failed:", (err as Error).message);
    process.exit(1);
  } finally {
    closeDb();
  }
}

function printConnectionStats(stats: { rowsParsed: number; peopleCreated: number; peopleUpdated: number; connectionsCreated: number; connectionsSkipped: number; errors: number }): void {
  console.log("\n--- Connection Import Results ---");
  console.log(`  Rows parsed: ${stats.rowsParsed}`);
  console.log(`  People created: ${stats.peopleCreated}`);
  console.log(`  People updated: ${stats.peopleUpdated}`);
  console.log(`  Connections created: ${stats.connectionsCreated}`);
  console.log(`  Connections skipped: ${stats.connectionsSkipped}`);
  if (stats.errors > 0) {
    console.log(`  Errors: ${stats.errors}`);
  }
}

function printMessageStats(stats: { rowsParsed: number; messagesCreated: number; messagesSkipped: number; peopleCreated: number; errors: number }): void {
  console.log("\n--- Message Import Results ---");
  console.log(`  Rows parsed: ${stats.rowsParsed}`);
  console.log(`  Messages created: ${stats.messagesCreated}`);
  console.log(`  Messages skipped: ${stats.messagesSkipped}`);
  console.log(`  People created: ${stats.peopleCreated}`);
  if (stats.errors > 0) {
    console.log(`  Errors: ${stats.errors}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  closeDb();
  process.exit(1);
});
