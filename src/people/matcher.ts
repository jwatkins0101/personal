// People matching logic - link items to people

import {
  findPersonByEmail,
  findPersonByIdentity,
  linkItemToPerson,
  addMatchCandidate,
  upsertPerson,
  addPersonIdentity,
} from "./repository.js";
import { MATCH_CONFIDENCE } from "./types.js";
import type { Person, IdentitySource } from "./types.js";

export interface MatchResult {
  matched: boolean;
  person?: Person;
  confidence: number;
  reason: string;
  autoLinked: boolean;
}

/**
 * Try to match an email address to a person.
 */
export function matchByEmail(email: string): MatchResult {
  if (!email || email.trim() === "") {
    return { matched: false, confidence: 0, reason: "No email provided", autoLinked: false };
  }

  const person = findPersonByEmail(email.toLowerCase());

  if (person) {
    return {
      matched: true,
      person,
      confidence: MATCH_CONFIDENCE.EXACT_EMAIL,
      reason: "Exact email match",
      autoLinked: true,
    };
  }

  return { matched: false, confidence: 0, reason: "No email match found", autoLinked: false };
}

/**
 * Try to match a phone number to a person.
 */
export function matchByPhone(phone: string): MatchResult {
  if (!phone || phone.trim() === "") {
    return { matched: false, confidence: 0, reason: "No phone provided", autoLinked: false };
  }

  // Normalize phone number (remove non-digits)
  const normalized = phone.replace(/\D/g, "");
  if (normalized.length < 10) {
    return { matched: false, confidence: 0, reason: "Invalid phone number", autoLinked: false };
  }

  const person = findPersonByIdentity("phone", normalized);

  if (person) {
    return {
      matched: true,
      person,
      confidence: MATCH_CONFIDENCE.EXACT_PHONE,
      reason: "Exact phone match",
      autoLinked: true,
    };
  }

  return { matched: false, confidence: 0, reason: "No phone match found", autoLinked: false };
}

/**
 * Try to match a LinkedIn URL to a person.
 */
export function matchByLinkedInUrl(url: string): MatchResult {
  if (!url || url.trim() === "") {
    return { matched: false, confidence: 0, reason: "No URL provided", autoLinked: false };
  }

  const person = findPersonByIdentity("linkedin_url", url);

  if (person) {
    return {
      matched: true,
      person,
      confidence: MATCH_CONFIDENCE.EXACT_LINKEDIN_URL,
      reason: "Exact LinkedIn URL match",
      autoLinked: true,
    };
  }

  return { matched: false, confidence: 0, reason: "No LinkedIn URL match found", autoLinked: false };
}

/**
 * Normalize a name for comparison.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate name similarity (simple approach).
 */
function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Check first/last name match
  const parts1 = n1.split(" ");
  const parts2 = n2.split(" ");

  let matchingParts = 0;
  for (const p1 of parts1) {
    if (parts2.includes(p1)) matchingParts++;
  }

  if (matchingParts > 0) {
    return 0.5 + (0.3 * matchingParts) / Math.max(parts1.length, parts2.length);
  }

  return 0;
}

/**
 * Try to find the best match for an item using available identifiers.
 */
export function findBestMatch(options: {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  name?: string;
  company?: string;
}): MatchResult {
  // Try exact matches in order of priority

  // 1. Email match
  if (options.email) {
    const result = matchByEmail(options.email);
    if (result.matched) return result;
  }

  // 2. LinkedIn URL match
  if (options.linkedinUrl) {
    const result = matchByLinkedInUrl(options.linkedinUrl);
    if (result.matched) return result;
  }

  // 3. Phone match
  if (options.phone) {
    const result = matchByPhone(options.phone);
    if (result.matched) return result;
  }

  // No exact match found
  return {
    matched: false,
    confidence: 0,
    reason: "No exact match found",
    autoLinked: false,
  };
}

/**
 * Link an item to a person if a match is found.
 * Returns the matched person or null.
 */
export function linkItemToMatchedPerson(
  itemId: string,
  options: {
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    name?: string;
  }
): { person: Person | null; confidence: number; reason: string } {
  const match = findBestMatch(options);

  if (match.matched && match.person && match.confidence >= MATCH_CONFIDENCE.AUTO_MERGE_THRESHOLD) {
    // Auto-link with high confidence
    linkItemToPerson(itemId, match.person.id, match.confidence, match.reason);
    return { person: match.person, confidence: match.confidence, reason: match.reason };
  }

  return { person: null, confidence: match.confidence, reason: match.reason };
}

/**
 * Extract email addresses from a string.
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return (text.match(emailRegex) || []).map((e) => e.toLowerCase());
}

/**
 * Extract phone numbers from a string.
 */
export function extractPhones(text: string): string[] {
  // Match various phone formats
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
  return (text.match(phoneRegex) || []).map((p) => p.replace(/\D/g, ""));
}

/**
 * Try to match or create a person from identifiers.
 * This is useful for matching iMessage contacts.
 */
export function matchOrCreatePerson(
  identifier: string,
  source: IdentitySource = "email_ingest"
): { person: Person; created: boolean } {
  // Determine identifier type
  const isEmail = identifier.includes("@");
  const isPhone = /^\+?[\d\s-()]+$/.test(identifier);

  if (isEmail) {
    const existing = findPersonByEmail(identifier);
    if (existing) {
      return { person: existing, created: false };
    }

    // Create new person from email
    const { id } = upsertPerson({
      display_name: identifier.split("@")[0].replace(/[._]/g, " "),
      primary_email: identifier.toLowerCase(),
    });

    addPersonIdentity(id, "email", identifier.toLowerCase(), MATCH_CONFIDENCE.EXACT_EMAIL, source);

    const person = {
      id,
      display_name: identifier.split("@")[0].replace(/[._]/g, " "),
      primary_email: identifier.toLowerCase(),
      primary_phone: null,
      linkedin_profile_url: null,
      company: null,
      title: null,
      location: null,
      notes: null,
      starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return { person, created: true };
  }

  if (isPhone) {
    const normalized = identifier.replace(/\D/g, "");
    const existing = findPersonByIdentity("phone", normalized);
    if (existing) {
      return { person: existing, created: false };
    }

    // Create new person from phone
    const { id } = upsertPerson({
      display_name: identifier,
      primary_phone: normalized,
    });

    addPersonIdentity(id, "phone", normalized, MATCH_CONFIDENCE.EXACT_PHONE, source);

    const person = {
      id,
      display_name: identifier,
      primary_email: null,
      primary_phone: normalized,
      linkedin_profile_url: null,
      company: null,
      title: null,
      location: null,
      notes: null,
      starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return { person, created: true };
  }

  // Unknown identifier type - create as name
  const { id } = upsertPerson({
    display_name: identifier,
  });

  const person = {
    id,
    display_name: identifier,
    primary_email: null,
    primary_phone: null,
    linkedin_profile_url: null,
    company: null,
    title: null,
    location: null,
    notes: null,
    starred: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { person, created: true };
}
