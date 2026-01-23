// LinkedIn data import service

import { createHash } from "crypto";
import { readFileSync, existsSync, statSync } from "fs";
import { basename, join, dirname } from "path";
import { getDb } from "../storage/db.js";
import { logSuccess, logFailure } from "../storage/action-log.js";
import {
  upsertPerson,
  addPersonIdentity,
  generatePersonId,
  findPersonByLinkedInUrl,
} from "../people/repository.js";
import { MATCH_CONFIDENCE } from "../people/types.js";
import {
  parseConnectionsCSV,
  parseMessagesCSV,
  parseLinkedInDate,
  normalizeLinkedInUrl,
} from "./parser.js";
import type { ImportStats, LinkedInConnectionRow, LinkedInMessageRow } from "./types.js";
import type { ImportBatch } from "../people/types.js";

/**
 * Compute file hash for idempotency.
 */
function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Generate a unique batch ID.
 */
function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an import batch record.
 */
function createImportBatch(
  source: string,
  filePath: string,
  fileHash: string
): string {
  const db = getDb();
  const id = generateBatchId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO import_batches (id, source, file_path, file_hash, started_at, status)
    VALUES (?, ?, ?, ?, ?, 'running')
  `).run(id, source, filePath, fileHash, now);

  return id;
}

/**
 * Complete an import batch.
 */
function completeImportBatch(
  batchId: string,
  status: "completed" | "failed",
  stats: ImportStats | null,
  error?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE import_batches
    SET completed_at = ?, status = ?, stats_json = ?, error_message = ?
    WHERE id = ?
  `).run(now, status, stats ? JSON.stringify(stats) : null, error ?? null, batchId);
}

/**
 * Check if a file has already been imported.
 */
function hasFileBeenImported(fileHash: string): ImportBatch | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM import_batches WHERE file_hash = ? AND status = 'completed'"
    )
    .get(fileHash) as ImportBatch | undefined;

  return row ?? null;
}

/**
 * Import LinkedIn connections from Connections.csv.
 */
export async function importConnections(
  filePath: string,
  options: { force?: boolean; since?: string } = {}
): Promise<ImportStats> {
  const stats: ImportStats = {
    file: basename(filePath),
    rowsParsed: 0,
    peopleCreated: 0,
    peopleUpdated: 0,
    connectionsCreated: 0,
    connectionsSkipped: 0,
    messagesCreated: 0,
    messagesSkipped: 0,
    errors: 0,
  };

  // Check file exists
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Compute file hash for idempotency
  const fileHash = computeFileHash(filePath);

  // Check if already imported
  if (!options.force) {
    const existing = hasFileBeenImported(fileHash);
    if (existing) {
      console.log(`File already imported on ${existing.completed_at}`);
      const existingStats = existing.stats_json
        ? JSON.parse(existing.stats_json)
        : stats;
      return existingStats;
    }
  }

  // Create import batch
  const batchId = createImportBatch("linkedin_connections", filePath, fileHash);

  try {
    // Parse CSV
    const { rows, errors } = parseConnectionsCSV(filePath);
    stats.rowsParsed = rows.length;
    stats.errors = errors.length;

    if (errors.length > 0) {
      console.warn("Parse errors:", errors.slice(0, 5));
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Filter by date if specified
    let filteredRows = rows;
    if (options.since) {
      const sinceDate = new Date(options.since);
      filteredRows = rows.filter((row) => {
        const connDate = parseLinkedInDate(row.connectedOn);
        return connDate && new Date(connDate) >= sinceDate;
      });
      console.log(
        `Filtered to ${filteredRows.length} connections since ${options.since}`
      );
    }

    // Process each connection
    for (const row of filteredRows) {
      try {
        await processConnection(db, row, batchId, now, stats);
      } catch (err) {
        console.error(`Error processing connection:`, err);
        stats.errors++;
      }
    }

    // Complete batch
    completeImportBatch(batchId, "completed", stats);

    // Log success
    logSuccess("linkedin_import", "ingest_linkedin", {
      file: filePath,
      batchId,
    }, stats as unknown as Record<string, unknown>);

    return stats;
  } catch (err) {
    completeImportBatch(batchId, "failed", stats, (err as Error).message);
    logFailure("linkedin_import", "ingest_linkedin", (err as Error).message, {
      file: filePath,
      batchId,
    });
    throw err;
  }
}

/**
 * Process a single connection row.
 */
async function processConnection(
  db: ReturnType<typeof getDb>,
  row: LinkedInConnectionRow,
  batchId: string,
  now: string,
  stats: ImportStats
): Promise<void> {
  const displayName = `${row.firstName} ${row.lastName}`.trim();
  const linkedinUrl = normalizeLinkedInUrl(row.url);
  const email = row.emailAddress?.toLowerCase() || null;
  const connectedOn = parseLinkedInDate(row.connectedOn);

  // Generate person ID based on LinkedIn URL
  const personId = generatePersonId(displayName, linkedinUrl, email);

  // Generate connection ID for idempotency
  const connectionId = createHash("sha256")
    .update(`${linkedinUrl}:${connectedOn}`)
    .digest("hex")
    .slice(0, 24);

  // Check if connection already exists
  const existingConnection = db
    .prepare("SELECT id FROM linkedin_connections WHERE id = ?")
    .get(connectionId);

  if (existingConnection) {
    stats.connectionsSkipped++;
    return;
  }

  // Upsert person
  const { id: actualPersonId, created } = upsertPerson({
    id: personId,
    display_name: displayName,
    primary_email: email,
    linkedin_profile_url: linkedinUrl,
    company: row.company,
    title: row.position,
  });

  if (created) {
    stats.peopleCreated++;
  } else {
    stats.peopleUpdated++;
  }

  // Add identities
  if (linkedinUrl) {
    addPersonIdentity(
      actualPersonId,
      "linkedin_url",
      linkedinUrl,
      MATCH_CONFIDENCE.EXACT_LINKEDIN_URL,
      "linkedin_import"
    );
  }

  if (email) {
    addPersonIdentity(
      actualPersonId,
      "email",
      email,
      MATCH_CONFIDENCE.EXACT_EMAIL,
      "linkedin_import"
    );
  }

  // Create connection record
  db.prepare(`
    INSERT INTO linkedin_connections (
      id, person_id, connected_on, import_batch_id, raw_data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    connectionId,
    actualPersonId,
    connectedOn,
    batchId,
    JSON.stringify(row),
    now
  );

  stats.connectionsCreated++;
}

/**
 * Import LinkedIn messages from messages.csv.
 */
export async function importMessages(
  filePath: string,
  options: { force?: boolean } = {}
): Promise<ImportStats> {
  const stats: ImportStats = {
    file: basename(filePath),
    rowsParsed: 0,
    peopleCreated: 0,
    peopleUpdated: 0,
    connectionsCreated: 0,
    connectionsSkipped: 0,
    messagesCreated: 0,
    messagesSkipped: 0,
    errors: 0,
  };

  // Check file exists
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Compute file hash for idempotency
  const fileHash = computeFileHash(filePath);

  // Check if already imported
  if (!options.force) {
    const existing = hasFileBeenImported(fileHash);
    if (existing) {
      console.log(`File already imported on ${existing.completed_at}`);
      const existingStats = existing.stats_json
        ? JSON.parse(existing.stats_json)
        : stats;
      return existingStats;
    }
  }

  // Create import batch
  const batchId = createImportBatch("linkedin_messages", filePath, fileHash);

  try {
    // Parse CSV
    const { rows, errors } = parseMessagesCSV(filePath);
    stats.rowsParsed = rows.length;
    stats.errors = errors.length;

    if (errors.length > 0) {
      console.warn("Parse errors:", errors.slice(0, 5));
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Process each message
    for (const row of rows) {
      try {
        await processMessage(db, row, batchId, now, stats);
      } catch (err) {
        console.error(`Error processing message:`, err);
        stats.errors++;
      }
    }

    // Complete batch
    completeImportBatch(batchId, "completed", stats);

    // Log success
    logSuccess("linkedin_import", "ingest_linkedin_messages", {
      file: filePath,
      batchId,
    }, stats as unknown as Record<string, unknown>);

    return stats;
  } catch (err) {
    completeImportBatch(batchId, "failed", stats, (err as Error).message);
    logFailure("linkedin_import", "ingest_linkedin_messages", (err as Error).message, {
      file: filePath,
      batchId,
    });
    throw err;
  }
}

/**
 * Process a single message row.
 */
async function processMessage(
  db: ReturnType<typeof getDb>,
  row: LinkedInMessageRow,
  batchId: string,
  now: string,
  stats: ImportStats
): Promise<void> {
  const messageDate = parseLinkedInDate(row.date);
  if (!messageDate) return;

  // Generate message ID for idempotency
  const messageId = createHash("sha256")
    .update(`${row.conversationId}:${row.date}:${row.from}`)
    .digest("hex")
    .slice(0, 24);

  // Check if message already exists
  const existingMessage = db
    .prepare("SELECT id FROM linkedin_messages WHERE id = ?")
    .get(messageId);

  if (existingMessage) {
    stats.messagesSkipped++;
    return;
  }

  // Find or create sender person
  const senderUrl = normalizeLinkedInUrl(row.senderProfileUrl);
  let fromPersonId: string | null = null;

  if (senderUrl) {
    const existingSender = findPersonByLinkedInUrl(senderUrl);
    if (existingSender) {
      fromPersonId = existingSender.id;
    } else if (row.from) {
      const { id, created } = upsertPerson({
        display_name: row.from,
        linkedin_profile_url: senderUrl,
      });
      fromPersonId = id;
      if (created) {
        stats.peopleCreated++;
        addPersonIdentity(
          id,
          "linkedin_url",
          senderUrl,
          MATCH_CONFIDENCE.EXACT_LINKEDIN_URL,
          "linkedin_import"
        );
      }
    }
  }

  // Find or create recipient person (just first recipient)
  const recipientUrl = normalizeLinkedInUrl(
    row.recipientProfileUrls?.split(",")[0]?.trim()
  );
  let toPersonId: string | null = null;

  if (recipientUrl) {
    const existingRecipient = findPersonByLinkedInUrl(recipientUrl);
    if (existingRecipient) {
      toPersonId = existingRecipient.id;
    } else if (row.to) {
      const { id, created } = upsertPerson({
        display_name: row.to,
        linkedin_profile_url: recipientUrl,
      });
      toPersonId = id;
      if (created) {
        stats.peopleCreated++;
        addPersonIdentity(
          id,
          "linkedin_url",
          recipientUrl,
          MATCH_CONFIDENCE.EXACT_LINKEDIN_URL,
          "linkedin_import"
        );
      }
    }
  }

  // Insert message
  db.prepare(`
    INSERT INTO linkedin_messages (
      id, conversation_id, from_person_id, to_person_id,
      from_name, to_name, from_profile_url, to_profile_url,
      message_date, subject, content, folder, import_batch_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    row.conversationId,
    fromPersonId,
    toPersonId,
    row.from,
    row.to,
    senderUrl,
    recipientUrl,
    messageDate,
    row.subject,
    row.content,
    row.folder,
    batchId,
    now
  );

  stats.messagesCreated++;
}

/**
 * Import all files from a LinkedIn export directory.
 */
export async function importLinkedInExport(
  dirPath: string,
  options: { force?: boolean; since?: string } = {}
): Promise<{ connections?: ImportStats; messages?: ImportStats }> {
  const results: { connections?: ImportStats; messages?: ImportStats } = {};

  // Import connections
  const connectionsPath = join(dirPath, "Connections.csv");
  if (existsSync(connectionsPath)) {
    console.log("\nImporting Connections.csv...");
    results.connections = await importConnections(connectionsPath, options);
    console.log(`  Connections: ${results.connections.connectionsCreated} created, ${results.connections.connectionsSkipped} skipped`);
  }

  // Import messages
  const messagesPath = join(dirPath, "messages.csv");
  if (existsSync(messagesPath)) {
    console.log("\nImporting messages.csv...");
    results.messages = await importMessages(messagesPath, { force: options.force });
    console.log(`  Messages: ${results.messages.messagesCreated} created, ${results.messages.messagesSkipped} skipped`);
  }

  return results;
}
