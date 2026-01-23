// CRUD operations for memory_items table

import { getDb } from "./db.js";
import type {
  MemoryItem,
  MemoryItemRow,
  NewMemoryItem,
  ItemSource,
  ItemStatus,
} from "./types.js";
import type { Category, Priority } from "../classifier/types.js";

/**
 * Generate a composite ID from source and source_ref.
 */
export function makeItemId(source: ItemSource, sourceRef: string): string {
  return `${source}:${sourceRef}`;
}

/**
 * Parse a composite ID into source and source_ref.
 */
export function parseItemId(id: string): { source: ItemSource; sourceRef: string } {
  const colonIndex = id.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid item ID format: ${id}`);
  }
  return {
    source: id.slice(0, colonIndex) as ItemSource,
    sourceRef: id.slice(colonIndex + 1),
  };
}

/**
 * Convert a database row to a MemoryItem.
 */
function rowToItem(row: MemoryItemRow): MemoryItem {
  return {
    id: row.id,
    source: row.source as ItemSource,
    source_ref: row.source_ref,
    ingested_at: row.ingested_at,
    occurred_at: row.occurred_at,
    title: row.title,
    summary: row.summary,
    snippet: row.snippet,
    raw_hash: row.raw_hash,
    category: row.category as Category | null,
    priority: row.priority as Priority | null,
    confidence: row.confidence,
    reason: row.reason,
    suggested_actions_json: row.suggested_actions_json,
    status: row.status as ItemStatus,
    route: row.route,
    metadata_json: row.metadata_json,
  };
}

/**
 * Insert a new memory item.
 * Returns true if inserted, false if already exists (by hash or source:ref).
 */
export function insertItem(item: NewMemoryItem): { inserted: boolean; id: string } {
  const db = getDb();
  const id = makeItemId(item.source, item.source_ref);
  const now = new Date().toISOString();

  // Check for existing by hash
  const existingByHash = db
    .prepare("SELECT id FROM memory_items WHERE raw_hash = ?")
    .get(item.raw_hash) as { id: string } | undefined;

  if (existingByHash) {
    return { inserted: false, id: existingByHash.id };
  }

  // Check for existing by source:ref
  const existingByRef = db
    .prepare("SELECT id FROM memory_items WHERE source = ? AND source_ref = ?")
    .get(item.source, item.source_ref) as { id: string } | undefined;

  if (existingByRef) {
    return { inserted: false, id: existingByRef.id };
  }

  // Insert new item
  db.prepare(`
    INSERT INTO memory_items (
      id, source, source_ref, ingested_at, occurred_at,
      title, summary, snippet, raw_hash, status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
  `).run(
    id,
    item.source,
    item.source_ref,
    now,
    item.occurred_at,
    item.title,
    item.summary ?? null,
    item.snippet,
    item.raw_hash,
    item.metadata_json ?? null
  );

  return { inserted: true, id };
}

/**
 * Get an item by ID.
 */
export function getItem(id: string): MemoryItem | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM memory_items WHERE id = ?").get(id) as
    | MemoryItemRow
    | undefined;

  return row ? rowToItem(row) : null;
}

/**
 * Get items by status.
 */
export function getItemsByStatus(status: ItemStatus): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM memory_items WHERE status = ? ORDER BY occurred_at DESC")
    .all(status) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get items by source.
 */
export function getItemsBySource(source: ItemSource): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM memory_items WHERE source = ? ORDER BY occurred_at DESC")
    .all(source) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get items by route.
 */
export function getItemsByRoute(route: string): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM memory_items WHERE route = ? ORDER BY occurred_at DESC")
    .all(route) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get items needing classification (status = 'new').
 */
export function getUnclassifiedItems(): MemoryItem[] {
  return getItemsByStatus("new");
}

/**
 * Get items queued for review.
 */
export function getQueuedItems(): MemoryItem[] {
  return getItemsByStatus("queued");
}

/**
 * Update an item's classification results.
 */
export function updateClassification(
  id: string,
  classification: {
    category: Category;
    priority: Priority;
    confidence: number;
    reason: string;
    suggested_actions_json?: string;
  }
): void {
  const db = getDb();
  db.prepare(`
    UPDATE memory_items
    SET category = ?, priority = ?, confidence = ?, reason = ?, suggested_actions_json = ?
    WHERE id = ?
  `).run(
    classification.category,
    classification.priority,
    classification.confidence,
    classification.reason,
    classification.suggested_actions_json ?? null,
    id
  );
}

/**
 * Update an item's status.
 */
export function updateStatus(id: string, status: ItemStatus): void {
  const db = getDb();
  db.prepare("UPDATE memory_items SET status = ? WHERE id = ?").run(status, id);
}

/**
 * Update an item's route.
 */
export function updateRoute(id: string, route: string): void {
  const db = getDb();
  db.prepare("UPDATE memory_items SET route = ? WHERE id = ?").run(route, id);
}

/**
 * Update status and route together.
 */
export function updateStatusAndRoute(
  id: string,
  status: ItemStatus,
  route: string
): void {
  const db = getDb();
  db.prepare("UPDATE memory_items SET status = ?, route = ? WHERE id = ?").run(
    status,
    route,
    id
  );
}

/**
 * Search items by title (LIKE query).
 */
export function searchByTitle(query: string): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM memory_items WHERE title LIKE ? ORDER BY occurred_at DESC LIMIT 100"
    )
    .all(`%${query}%`) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Search items by snippet content (LIKE query).
 */
export function searchByContent(query: string): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM memory_items WHERE snippet LIKE ? OR title LIKE ? ORDER BY occurred_at DESC LIMIT 100"
    )
    .all(`%${query}%`, `%${query}%`) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get items for a date range.
 */
export function getItemsInRange(startDate: string, endDate: string): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT * FROM memory_items
      WHERE occurred_at >= ? AND occurred_at < ?
      ORDER BY occurred_at DESC
    `)
    .all(startDate, endDate) as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get urgent (P0) or high priority (P1) items.
 */
export function getHighPriorityItems(): MemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT * FROM memory_items
      WHERE priority IN ('P0', 'P1') AND status NOT IN ('acted', 'ignored')
      ORDER BY
        CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
        occurred_at DESC
    `)
    .all() as MemoryItemRow[];

  return rows.map(rowToItem);
}

/**
 * Get count of items by status.
 */
export function getStatusCounts(): Record<ItemStatus, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) as count FROM memory_items GROUP BY status")
    .all() as { status: string; count: number }[];

  const counts: Record<ItemStatus, number> = {
    new: 0,
    processed: 0,
    queued: 0,
    acted: 0,
    ignored: 0,
    error: 0,
  };

  for (const row of rows) {
    counts[row.status as ItemStatus] = row.count;
  }

  return counts;
}

/**
 * Delete an item by ID.
 */
export function deleteItem(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM memory_items WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Update a specific field on an item.
 */
export function updateField(
  id: string,
  field: keyof MemoryItem,
  value: string | number | null
): void {
  const db = getDb();
  // Validate field name to prevent SQL injection
  const allowedFields = [
    "category",
    "priority",
    "confidence",
    "reason",
    "status",
    "route",
    "summary",
    "suggested_actions_json",
    "metadata_json",
  ];
  if (!allowedFields.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }
  db.prepare(`UPDATE memory_items SET ${field} = ? WHERE id = ?`).run(value, id);
}
