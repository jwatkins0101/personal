// CSV parser for LinkedIn export files

import { readFileSync } from "fs";
import type {
  LinkedInConnectionRow,
  LinkedInMessageRow,
  ParseResult,
} from "./types.js";
import { CONNECTIONS_COLUMNS, MESSAGES_COLUMNS } from "./types.js";

/**
 * Parse a CSV line, handling quoted fields with commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse a CSV file into rows with headers as keys.
 */
function parseCSV<T>(
  content: string,
  columnMapping: Record<string, string>
): ParseResult<T> {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  const errors: string[] = [];
  const rows: T[] = [];

  if (lines.length === 0) {
    return { rows: [], errors: ["Empty file"] };
  }

  // Find header line (skip any notes at the start)
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCSVLine(lines[i]);
    // Check if this line contains expected headers
    const hasKnownHeader = parsed.some((col) =>
      Object.keys(columnMapping).includes(col)
    );
    if (hasKnownHeader) {
      headerIndex = i;
      break;
    }
  }

  const headers = parseCSVLine(lines[headerIndex]);

  // Map headers to our field names
  const fieldIndexes: Record<string, number> = {};
  headers.forEach((header, index) => {
    const fieldName = columnMapping[header];
    if (fieldName) {
      fieldIndexes[fieldName] = index;
    }
  });

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);
      const row: Record<string, string | null> = {};

      for (const [fieldName, index] of Object.entries(fieldIndexes)) {
        const value = values[index]?.trim();
        row[fieldName] = value && value !== "" ? value : null;
      }

      rows.push(row as T);
    } catch (err) {
      errors.push(`Line ${i + 1}: ${(err as Error).message}`);
    }
  }

  return { rows, errors };
}

/**
 * Parse LinkedIn Connections.csv file.
 */
export function parseConnectionsCSV(filePath: string): ParseResult<LinkedInConnectionRow> {
  const content = readFileSync(filePath, "utf-8");
  return parseCSV<LinkedInConnectionRow>(content, CONNECTIONS_COLUMNS);
}

/**
 * Parse LinkedIn messages.csv file.
 */
export function parseMessagesCSV(filePath: string): ParseResult<LinkedInMessageRow> {
  const content = readFileSync(filePath, "utf-8");
  return parseCSV<LinkedInMessageRow>(content, MESSAGES_COLUMNS);
}

/**
 * Parse a date string from LinkedIn export.
 * Formats: "22 Jan 2026" or "2026-01-22 19:37:40 UTC"
 */
export function parseLinkedInDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // Try ISO format first (messages)
  if (dateStr.includes("-") && dateStr.includes(":")) {
    try {
      return new Date(dateStr).toISOString();
    } catch {
      // Fall through
    }
  }

  // Try "22 Jan 2026" format (connections)
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    const monthMap: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04",
      May: "05", Jun: "06", Jul: "07", Aug: "08",
      Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const monthNum = monthMap[month];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, "0")}`;
    }
  }

  return dateStr;
}

/**
 * Normalize a LinkedIn profile URL.
 */
export function normalizeLinkedInUrl(url: string | null): string | null {
  if (!url) return null;

  // Remove trailing slashes and query params
  let normalized = url.split("?")[0].replace(/\/+$/, "");

  // Ensure https
  if (normalized.startsWith("http://")) {
    normalized = normalized.replace("http://", "https://");
  }

  return normalized;
}
