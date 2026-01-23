// CRUD operations for people tables

import { createHash } from "crypto";
import { getDb } from "../storage/db.js";
import type {
  Person,
  PersonRow,
  PersonIdentity,
  PersonIdentityRow,
  ItemPersonMap,
  NewPerson,
  IdentityType,
  IdentitySource,
  MatchCandidate,
  PersonNudge,
  PersonWithContext,
} from "./types.js";
import { MATCH_CONFIDENCE } from "./types.js";

/**
 * Generate a stable person ID from name and optional identifiers.
 */
export function generatePersonId(
  displayName: string,
  linkedinUrl?: string | null,
  email?: string | null
): string {
  // Prefer LinkedIn URL for stable ID, then email, then name hash
  if (linkedinUrl) {
    return `li:${createHash("sha256").update(linkedinUrl).digest("hex").slice(0, 16)}`;
  }
  if (email) {
    return `em:${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16)}`;
  }
  // Fallback to name-based hash
  const normalized = displayName.toLowerCase().replace(/\s+/g, "_");
  return `nm:${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

/**
 * Convert a database row to a Person.
 */
function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    display_name: row.display_name,
    primary_email: row.primary_email,
    primary_phone: row.primary_phone,
    linkedin_profile_url: row.linkedin_profile_url,
    company: row.company,
    title: row.title,
    location: row.location,
    notes: row.notes,
    starred: row.starred === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Upsert a person - insert or update if exists.
 */
export function upsertPerson(person: NewPerson & { id?: string }): {
  id: string;
  created: boolean;
} {
  const db = getDb();
  const now = new Date().toISOString();

  // Generate ID if not provided
  const id =
    person.id ||
    generatePersonId(
      person.display_name,
      person.linkedin_profile_url,
      person.primary_email
    );

  // Check if person exists
  const existing = db
    .prepare("SELECT id FROM people WHERE id = ?")
    .get(id) as { id: string } | undefined;

  if (existing) {
    // Update existing person
    db.prepare(`
      UPDATE people SET
        display_name = COALESCE(?, display_name),
        primary_email = COALESCE(?, primary_email),
        primary_phone = COALESCE(?, primary_phone),
        linkedin_profile_url = COALESCE(?, linkedin_profile_url),
        company = COALESCE(?, company),
        title = COALESCE(?, title),
        location = COALESCE(?, location),
        updated_at = ?
      WHERE id = ?
    `).run(
      person.display_name,
      person.primary_email ?? null,
      person.primary_phone ?? null,
      person.linkedin_profile_url ?? null,
      person.company ?? null,
      person.title ?? null,
      person.location ?? null,
      now,
      id
    );

    return { id, created: false };
  }

  // Insert new person
  db.prepare(`
    INSERT INTO people (
      id, display_name, primary_email, primary_phone,
      linkedin_profile_url, company, title, location,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    person.display_name,
    person.primary_email ?? null,
    person.primary_phone ?? null,
    person.linkedin_profile_url ?? null,
    person.company ?? null,
    person.title ?? null,
    person.location ?? null,
    now,
    now
  );

  return { id, created: true };
}

/**
 * Get a person by ID.
 */
export function getPerson(id: string): Person | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM people WHERE id = ?").get(id) as
    | PersonRow
    | undefined;

  return row ? rowToPerson(row) : null;
}

/**
 * Find person by LinkedIn URL.
 */
export function findPersonByLinkedInUrl(url: string): Person | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM people WHERE linkedin_profile_url = ?")
    .get(url) as PersonRow | undefined;

  return row ? rowToPerson(row) : null;
}

/**
 * Find person by email.
 */
export function findPersonByEmail(email: string): Person | null {
  const db = getDb();

  // Check primary email
  let row = db
    .prepare("SELECT * FROM people WHERE LOWER(primary_email) = LOWER(?)")
    .get(email) as PersonRow | undefined;

  if (row) return rowToPerson(row);

  // Check identities
  const identity = db
    .prepare(`
      SELECT person_id FROM person_identities
      WHERE identity_type = 'email' AND LOWER(identity_value) = LOWER(?)
    `)
    .get(email) as { person_id: string } | undefined;

  if (identity) {
    row = db.prepare("SELECT * FROM people WHERE id = ?").get(identity.person_id) as
      | PersonRow
      | undefined;
  }

  return row ? rowToPerson(row) : null;
}

/**
 * Find person by any identity.
 */
export function findPersonByIdentity(
  type: IdentityType,
  value: string
): Person | null {
  const db = getDb();

  const identity = db
    .prepare(`
      SELECT person_id FROM person_identities
      WHERE identity_type = ? AND LOWER(identity_value) = LOWER(?)
    `)
    .get(type, value) as { person_id: string } | undefined;

  if (!identity) return null;

  const row = db.prepare("SELECT * FROM people WHERE id = ?").get(identity.person_id) as
    | PersonRow
    | undefined;

  return row ? rowToPerson(row) : null;
}

/**
 * Add an identity to a person.
 */
export function addPersonIdentity(
  personId: string,
  identityType: IdentityType,
  identityValue: string,
  confidence: number,
  source: IdentitySource
): { added: boolean; existingPersonId?: string } {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if this identity already exists
  const existing = db
    .prepare(`
      SELECT person_id FROM person_identities
      WHERE identity_type = ? AND LOWER(identity_value) = LOWER(?)
    `)
    .get(identityType, identityValue) as { person_id: string } | undefined;

  if (existing) {
    return { added: false, existingPersonId: existing.person_id };
  }

  // Insert new identity
  db.prepare(`
    INSERT INTO person_identities (
      person_id, identity_type, identity_value, confidence, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(personId, identityType, identityValue, confidence, source, now);

  return { added: true };
}

/**
 * Get all identities for a person.
 */
export function getPersonIdentities(personId: string): PersonIdentity[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM person_identities WHERE person_id = ?")
    .all(personId) as PersonIdentityRow[];

  return rows.map((row) => ({
    id: row.id,
    person_id: row.person_id,
    identity_type: row.identity_type as IdentityType,
    identity_value: row.identity_value,
    confidence: row.confidence,
    source: row.source as IdentitySource,
    created_at: row.created_at,
  }));
}

/**
 * Link an item to a person.
 */
export function linkItemToPerson(
  itemId: string,
  personId: string,
  confidence: number,
  reason: string
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if link already exists
  const existing = db
    .prepare("SELECT 1 FROM item_people_map WHERE item_id = ? AND person_id = ?")
    .get(itemId, personId);

  if (existing) {
    return false;
  }

  db.prepare(`
    INSERT INTO item_people_map (item_id, person_id, match_confidence, match_reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(itemId, personId, confidence, reason, now);

  return true;
}

/**
 * Get people linked to an item.
 */
export function getPeopleForItem(itemId: string): Array<Person & { match_confidence: number; match_reason: string }> {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT p.*, ipm.match_confidence, ipm.match_reason
      FROM people p
      JOIN item_people_map ipm ON p.id = ipm.person_id
      WHERE ipm.item_id = ?
    `)
    .all(itemId) as Array<PersonRow & { match_confidence: number; match_reason: string }>;

  return rows.map((row) => ({
    ...rowToPerson(row),
    match_confidence: row.match_confidence,
    match_reason: row.match_reason,
  }));
}

/**
 * Get items linked to a person.
 */
export function getItemsForPerson(personId: string): ItemPersonMap[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM item_people_map WHERE person_id = ?")
    .all(personId) as ItemPersonMap[];
}

/**
 * Merge two people - move all identities and mappings from secondary to primary.
 */
export function mergePeople(
  primaryId: string,
  secondaryId: string
): { success: boolean; error?: string } {
  const db = getDb();

  const primary = getPerson(primaryId);
  const secondary = getPerson(secondaryId);

  if (!primary) {
    return { success: false, error: `Primary person not found: ${primaryId}` };
  }
  if (!secondary) {
    return { success: false, error: `Secondary person not found: ${secondaryId}` };
  }

  db.transaction(() => {
    // Move identities
    db.prepare(`
      UPDATE OR IGNORE person_identities SET person_id = ? WHERE person_id = ?
    `).run(primaryId, secondaryId);

    // Delete conflicting identities
    db.prepare("DELETE FROM person_identities WHERE person_id = ?").run(secondaryId);

    // Move item mappings
    db.prepare(`
      UPDATE OR IGNORE item_people_map SET person_id = ? WHERE person_id = ?
    `).run(primaryId, secondaryId);

    // Delete conflicting mappings
    db.prepare("DELETE FROM item_people_map WHERE person_id = ?").run(secondaryId);

    // Move LinkedIn connections
    db.prepare(`
      UPDATE linkedin_connections SET person_id = ? WHERE person_id = ?
    `).run(primaryId, secondaryId);

    // Move LinkedIn messages
    db.prepare(`
      UPDATE linkedin_messages SET from_person_id = ? WHERE from_person_id = ?
    `).run(primaryId, secondaryId);
    db.prepare(`
      UPDATE linkedin_messages SET to_person_id = ? WHERE to_person_id = ?
    `).run(primaryId, secondaryId);

    // Update primary with any missing fields from secondary
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE people SET
        primary_email = COALESCE(primary_email, ?),
        primary_phone = COALESCE(primary_phone, ?),
        linkedin_profile_url = COALESCE(linkedin_profile_url, ?),
        company = COALESCE(company, ?),
        title = COALESCE(title, ?),
        location = COALESCE(location, ?),
        updated_at = ?
      WHERE id = ?
    `).run(
      secondary.primary_email,
      secondary.primary_phone,
      secondary.linkedin_profile_url,
      secondary.company,
      secondary.title,
      secondary.location,
      now,
      primaryId
    );

    // Delete secondary person
    db.prepare("DELETE FROM people WHERE id = ?").run(secondaryId);
  })();

  return { success: true };
}

/**
 * Search people by name.
 */
export function searchPeople(query: string, limit = 50): Person[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT * FROM people
      WHERE display_name LIKE ? OR company LIKE ? OR primary_email LIKE ?
      ORDER BY display_name
      LIMIT ?
    `)
    .all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as PersonRow[];

  return rows.map(rowToPerson);
}

/**
 * List all people with optional filters.
 */
export function listPeople(options: {
  linkedinOnly?: boolean;
  starred?: boolean;
  limit?: number;
  offset?: number;
} = {}): Person[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.linkedinOnly) {
    conditions.push("linkedin_profile_url IS NOT NULL");
  }
  if (options.starred) {
    conditions.push("starred = 1");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = db
    .prepare(`
      SELECT * FROM people
      ${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as PersonRow[];

  return rows.map(rowToPerson);
}

/**
 * Get people to nudge (no interaction in N days).
 */
export function listPeopleToNudge(
  daysSinceInteraction: number,
  limit = 10
): PersonNudge[] {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceInteraction);
  const cutoffStr = cutoffDate.toISOString();

  // Get LinkedIn connections with no recent interaction
  const rows = db
    .prepare(`
      SELECT
        p.*,
        lc.connected_on,
        (
          SELECT MAX(m.occurred_at)
          FROM memory_items m
          JOIN item_people_map ipm ON m.id = ipm.item_id
          WHERE ipm.person_id = p.id
        ) as last_interaction,
        (
          SELECT MAX(lm.message_date)
          FROM linkedin_messages lm
          WHERE lm.from_person_id = p.id OR lm.to_person_id = p.id
        ) as last_linkedin_message
      FROM people p
      JOIN linkedin_connections lc ON p.id = lc.person_id
      WHERE p.id != (SELECT id FROM people WHERE linkedin_profile_url LIKE '%jermainewatkins%' LIMIT 1)
      ORDER BY
        CASE
          WHEN lc.connected_on >= date('now', '-7 days') THEN 0
          ELSE 1
        END,
        COALESCE(last_interaction, last_linkedin_message, '1970-01-01') ASC
      LIMIT ?
    `)
    .all(limit) as Array<PersonRow & {
      connected_on: string | null;
      last_interaction: string | null;
      last_linkedin_message: string | null;
    }>;

  return rows.map((row) => {
    const lastDate = row.last_interaction || row.last_linkedin_message;
    const daysSince = lastDate
      ? Math.floor(
          (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 999;

    let reason = "No recent interaction";
    if (row.connected_on && new Date(row.connected_on) >= cutoffDate) {
      reason = "New connection - introduce yourself";
    } else if (daysSince > daysSinceInteraction) {
      reason = `No contact in ${daysSince} days`;
    }

    return {
      person: rowToPerson(row),
      days_since_interaction: daysSince,
      last_interaction_type: row.last_interaction ? "item" : row.last_linkedin_message ? "linkedin" : null,
      connection_date: row.connected_on,
      reason,
    };
  });
}

/**
 * Get recent LinkedIn connections.
 */
export function getRecentConnections(limit = 10): Array<Person & { connected_on: string }> {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT p.*, lc.connected_on
      FROM people p
      JOIN linkedin_connections lc ON p.id = lc.person_id
      ORDER BY lc.connected_on DESC
      LIMIT ?
    `)
    .all(limit) as Array<PersonRow & { connected_on: string }>;

  return rows.map((row) => ({
    ...rowToPerson(row),
    connected_on: row.connected_on,
  }));
}

/**
 * Get count of people.
 */
export function getPeopleCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM people").get() as { count: number };
  return row.count;
}

/**
 * Get count of LinkedIn connections.
 */
export function getLinkedInConnectionCount(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM linkedin_connections")
    .get() as { count: number };
  return row.count;
}

/**
 * Add a match candidate for review.
 */
export function addMatchCandidate(candidate: Omit<MatchCandidate, "id" | "status" | "resolved_at" | "resolution" | "created_at">): number {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      INSERT INTO match_candidates (
        person_id, candidate_person_id, match_type, match_value, confidence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `)
    .run(
      candidate.person_id,
      candidate.candidate_person_id,
      candidate.match_type,
      candidate.match_value,
      candidate.confidence,
      now
    );

  return result.lastInsertRowid as number;
}

/**
 * Get pending match candidates.
 */
export function getPendingMatchCandidates(): MatchCandidate[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM match_candidates WHERE status = 'pending' ORDER BY confidence DESC")
    .all() as MatchCandidate[];
}

/**
 * Resolve a match candidate.
 */
export function resolveMatchCandidate(
  id: number,
  resolution: "approved" | "rejected"
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE match_candidates
    SET status = ?, resolved_at = ?, resolution = ?
    WHERE id = ?
  `).run(resolution, now, resolution, id);
}

/**
 * Update a person's field.
 */
export function updatePersonField(
  personId: string,
  field: keyof Person,
  value: string | boolean | null
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const allowedFields = [
    "display_name",
    "primary_email",
    "primary_phone",
    "linkedin_profile_url",
    "company",
    "title",
    "location",
    "notes",
    "starred",
  ];

  if (!allowedFields.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  const dbValue = typeof value === "boolean" ? (value ? 1 : 0) : value;

  db.prepare(`UPDATE people SET ${field} = ?, updated_at = ? WHERE id = ?`).run(
    dbValue,
    now,
    personId
  );
}

/**
 * Delete a person.
 */
export function deletePerson(personId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM people WHERE id = ?").run(personId);
  return result.changes > 0;
}
