// Command: fix:person - Apply corrections to people

import { closeDb } from "../storage/db.js";
import { logSuccess, logFailure } from "../storage/action-log.js";
import { recordFeedback } from "../storage/feedback.js";
import {
  getPerson,
  mergePeople,
  updatePersonField,
  addPersonIdentity,
  getPersonIdentities,
  searchPeople,
  linkItemToPerson,
  getItemsForPerson,
  deletePerson,
  upsertPerson,
} from "../people/repository.js";
import { getDb } from "../storage/db.js";
import type { Person, IdentityType } from "../people/types.js";

function printUsage(): void {
  console.log(`
Usage: npm run fix:person -- <command> [options]

Commands:
  create "Name" [--email x@y.com] [--phone 1234567890] [--company X] [--title Y]
    Create a new person with optional identities

  merge <primaryId> <secondaryId>
    Merge two people (secondary into primary)

  unlink-item <personId> <itemId>
    Remove an item-to-person link

  set <personId> <field>=<value> [field2=value2 ...]
    Update person fields (email, phone, linkedin_url, company, title, name)

  add-identity <personId> <type> <value>
    Add an identity (email, phone, linkedin_url)

  delete <personId>
    Delete a person (with confirmation)

  search <query>
    Search for people by name, email, or company

  show <personId>
    Show person details including identities and linked items

Examples:
  npm run fix:person -- create "John Smith" --email john@example.com --phone 5551234567
  npm run fix:person -- merge li:abc123 em:def456
  npm run fix:person -- set li:abc123 email=john@example.com company="Acme Inc"
  npm run fix:person -- add-identity li:abc123 email john@example.com
  npm run fix:person -- unlink-item li:abc123 email:789
  npm run fix:person -- search "John Smith"
  npm run fix:person -- show li:abc123
`);
}

/**
 * Parse repeated --flag values from args.
 * e.g. --email a@b.com --email c@d.com => ["a@b.com", "c@d.com"]
 */
function parseMultiFlag(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1]);
      i++; // skip value
    }
  }
  return values;
}

function parseSingleFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

async function handleCreate(args: string[]): Promise<void> {
  // First non-flag arg after "create" is the name
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) {
    console.error("Usage: fix:person create \"Name\" [--email x@y.com] [--phone 1234567890] [--company X] [--title Y]");
    process.exit(1);
  }

  const emails = parseMultiFlag(args, "--email");
  const phones = parseMultiFlag(args, "--phone");
  const company = parseSingleFlag(args, "--company");
  const title = parseSingleFlag(args, "--title");

  console.log(`\nCreating person: ${name}`);
  if (emails.length > 0) console.log(`  Emails: ${emails.join(", ")}`);
  if (phones.length > 0) console.log(`  Phones: ${phones.join(", ")}`);
  if (company) console.log(`  Company: ${company}`);
  if (title) console.log(`  Title: ${title}`);

  const { id, created } = upsertPerson({
    display_name: name,
    primary_email: emails[0] || undefined,
    primary_phone: phones[0] || undefined,
    company: company || undefined,
    title: title || undefined,
  });

  if (created) {
    console.log(`\n✓ Created person: ${id}`);
  } else {
    console.log(`\n✓ Person already exists: ${id} (updated)`);
  }

  // Add all email identities
  for (const email of emails) {
    const result = addPersonIdentity(id, "email", email.toLowerCase(), 1.0, "manual_fix");
    if (result.added) {
      console.log(`  Added email identity: ${email}`);
    } else {
      console.log(`  Email identity already exists: ${email} (person: ${result.existingPersonId})`);
    }
  }

  // Add all phone identities
  for (const phone of phones) {
    const normalized = phone.replace(/\D/g, "");
    const result = addPersonIdentity(id, "phone", normalized, 1.0, "manual_fix");
    if (result.added) {
      console.log(`  Added phone identity: ${normalized}`);
    } else {
      console.log(`  Phone identity already exists: ${normalized} (person: ${result.existingPersonId})`);
    }
  }

  logSuccess(id, "create_person", { name, emails, phones, company, title }, {});
}

async function handleMerge(primaryId: string, secondaryId: string): Promise<void> {
  const primary = getPerson(primaryId);
  const secondary = getPerson(secondaryId);

  if (!primary) {
    console.error(`Primary person not found: ${primaryId}`);
    process.exit(1);
  }
  if (!secondary) {
    console.error(`Secondary person not found: ${secondaryId}`);
    process.exit(1);
  }

  console.log(`\nMerging people:`);
  console.log(`  Primary: ${primary.display_name} (${primaryId})`);
  console.log(`  Secondary: ${secondary.display_name} (${secondaryId})`);

  const result = mergePeople(primaryId, secondaryId);

  if (result.success) {
    console.log(`\n✓ Merge successful`);

    // Log the action
    logSuccess(primaryId, "merge_people", {
      primaryId,
      secondaryId,
    }, { merged: true });

    // Record feedback
    recordFeedback({
      item_id: primaryId,
      created_at: new Date().toISOString(),
      field: "merge",
      old_value: secondaryId,
      new_value: primaryId,
      user_note: `Merged ${secondary.display_name} into ${primary.display_name}`,
    });
  } else {
    console.error(`\n✗ Merge failed: ${result.error}`);
    logFailure(primaryId, "merge_people", result.error || "Unknown error");
    process.exit(1);
  }
}

async function handleUnlinkItem(personId: string, itemId: string): Promise<void> {
  const person = getPerson(personId);
  if (!person) {
    console.error(`Person not found: ${personId}`);
    process.exit(1);
  }

  const db = getDb();

  // Check if link exists
  const link = db
    .prepare("SELECT * FROM item_people_map WHERE item_id = ? AND person_id = ?")
    .get(itemId, personId);

  if (!link) {
    console.error(`No link found between ${itemId} and ${personId}`);
    process.exit(1);
  }

  // Delete the link
  db.prepare("DELETE FROM item_people_map WHERE item_id = ? AND person_id = ?")
    .run(itemId, personId);

  console.log(`\n✓ Unlinked item ${itemId} from ${person.display_name}`);

  logSuccess(personId, "unlink_item", { itemId, personId }, { unlinked: true });

  recordFeedback({
    item_id: personId,
    created_at: new Date().toISOString(),
    field: "item_link",
    old_value: itemId,
    new_value: "null",
    user_note: `Removed link to item ${itemId}`,
  });
}

async function handleSet(personId: string, assignments: string[]): Promise<void> {
  const person = getPerson(personId);
  if (!person) {
    console.error(`Person not found: ${personId}`);
    process.exit(1);
  }

  console.log(`\nUpdating ${person.display_name}:`);

  const fieldMap: Record<string, keyof Person> = {
    email: "primary_email",
    phone: "primary_phone",
    linkedin_url: "linkedin_profile_url",
    company: "company",
    title: "title",
    name: "display_name",
    location: "location",
    notes: "notes",
  };

  for (const assignment of assignments) {
    const eqIndex = assignment.indexOf("=");
    if (eqIndex === -1) {
      console.error(`Invalid assignment: ${assignment}`);
      continue;
    }

    const key = assignment.slice(0, eqIndex);
    let value = assignment.slice(eqIndex + 1);

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    const dbField = fieldMap[key];
    if (!dbField) {
      console.error(`Unknown field: ${key}`);
      console.log(`Valid fields: ${Object.keys(fieldMap).join(", ")}`);
      continue;
    }

    const oldValue = person[dbField];

    try {
      updatePersonField(personId, dbField, value);
      console.log(`  ${key}: "${oldValue || ""}" → "${value}"`);

      recordFeedback({
        item_id: personId,
        created_at: new Date().toISOString(),
        field: dbField,
        old_value: String(oldValue || ""),
        new_value: value,
        user_note: null,
      });
    } catch (err) {
      console.error(`  Failed to update ${key}: ${(err as Error).message}`);
    }
  }

  logSuccess(personId, "update_person", { personId, assignments }, {});
  console.log(`\n✓ Update complete`);
}

async function handleAddIdentity(
  personId: string,
  type: string,
  value: string
): Promise<void> {
  const person = getPerson(personId);
  if (!person) {
    console.error(`Person not found: ${personId}`);
    process.exit(1);
  }

  const validTypes: IdentityType[] = ["email", "phone", "linkedin_url"];
  if (!validTypes.includes(type as IdentityType)) {
    console.error(`Invalid identity type: ${type}`);
    console.log(`Valid types: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const result = addPersonIdentity(
    personId,
    type as IdentityType,
    value,
    1.0,
    "manual_fix"
  );

  if (result.added) {
    console.log(`\n✓ Added ${type} identity: ${value}`);
    logSuccess(personId, "add_identity", { type, value }, {});
  } else {
    console.log(`\n⚠ Identity already exists for person: ${result.existingPersonId}`);
  }
}

async function handleDelete(personId: string): Promise<void> {
  const person = getPerson(personId);
  if (!person) {
    console.error(`Person not found: ${personId}`);
    process.exit(1);
  }

  // Show what will be deleted
  const identities = getPersonIdentities(personId);
  const items = getItemsForPerson(personId);

  console.log(`\nAbout to delete:`);
  console.log(`  Person: ${person.display_name} (${personId})`);
  console.log(`  Identities: ${identities.length}`);
  console.log(`  Linked items: ${items.length}`);

  // Check for --yes flag
  if (!process.argv.includes("--yes") && !process.argv.includes("-y")) {
    console.log(`\nAdd --yes to confirm deletion`);
    return;
  }

  const deleted = deletePerson(personId);
  if (deleted) {
    console.log(`\n✓ Deleted person: ${person.display_name}`);
    logSuccess(personId, "delete_person", { personId }, {});
  } else {
    console.error(`\n✗ Failed to delete person`);
  }
}

async function handleSearch(query: string): Promise<void> {
  const results = searchPeople(query, 20);

  console.log(`\nSearch results for "${query}":`);
  console.log("─".repeat(50));

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const person of results) {
    console.log(`\n${person.display_name}`);
    console.log(`  ID: ${person.id}`);
    if (person.primary_email) console.log(`  Email: ${person.primary_email}`);
    if (person.company) console.log(`  Company: ${person.company}`);
    if (person.title) console.log(`  Title: ${person.title}`);
    if (person.linkedin_profile_url) console.log(`  LinkedIn: ${person.linkedin_profile_url}`);
  }

  console.log(`\n${results.length} result(s) found.`);
}

async function handleShow(personId: string): Promise<void> {
  const person = getPerson(personId);
  if (!person) {
    console.error(`Person not found: ${personId}`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`PERSON DETAILS`);
  console.log(`${"=".repeat(50)}`);

  console.log(`\n${person.display_name}`);
  console.log(`${"─".repeat(40)}`);
  console.log(`  ID: ${person.id}`);
  console.log(`  Email: ${person.primary_email || "(none)"}`);
  console.log(`  Phone: ${person.primary_phone || "(none)"}`);
  console.log(`  Company: ${person.company || "(none)"}`);
  console.log(`  Title: ${person.title || "(none)"}`);
  console.log(`  Location: ${person.location || "(none)"}`);
  console.log(`  LinkedIn: ${person.linkedin_profile_url || "(none)"}`);
  console.log(`  Starred: ${person.starred ? "Yes" : "No"}`);
  console.log(`  Created: ${person.created_at}`);
  console.log(`  Updated: ${person.updated_at}`);

  // Show identities
  const identities = getPersonIdentities(personId);
  if (identities.length > 0) {
    console.log(`\nIdentities (${identities.length}):`);
    console.log(`${"─".repeat(40)}`);
    for (const id of identities) {
      console.log(`  ${id.identity_type}: ${id.identity_value} (${(id.confidence * 100).toFixed(0)}% - ${id.source})`);
    }
  }

  // Show linked items
  const items = getItemsForPerson(personId);
  if (items.length > 0) {
    console.log(`\nLinked Items (${items.length}):`);
    console.log(`${"─".repeat(40)}`);
    for (const item of items.slice(0, 10)) {
      console.log(`  ${item.item_id} (${(item.match_confidence * 100).toFixed(0)}%)`);
    }
    if (items.length > 10) {
      console.log(`  ... and ${items.length - 10} more`);
    }
  }

  // Check for LinkedIn connection
  const db = getDb();
  const connection = db
    .prepare("SELECT * FROM linkedin_connections WHERE person_id = ?")
    .get(personId) as { connected_on: string } | undefined;

  if (connection) {
    console.log(`\nLinkedIn Connection:`);
    console.log(`${"─".repeat(40)}`);
    console.log(`  Connected: ${connection.connected_on || "Unknown"}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case "create":
        if (args.length < 2) {
          console.error("Usage: fix:person create \"Name\" [--email x@y.com] [--phone 1234567890]");
          process.exit(1);
        }
        await handleCreate(args.slice(1));
        break;

      case "merge":
        if (args.length < 3) {
          console.error("Usage: fix:person merge <primaryId> <secondaryId>");
          process.exit(1);
        }
        await handleMerge(args[1], args[2]);
        break;

      case "unlink-item":
        if (args.length < 3) {
          console.error("Usage: fix:person unlink-item <personId> <itemId>");
          process.exit(1);
        }
        await handleUnlinkItem(args[1], args[2]);
        break;

      case "set":
        if (args.length < 3) {
          console.error("Usage: fix:person set <personId> <field>=<value> ...");
          process.exit(1);
        }
        await handleSet(args[1], args.slice(2));
        break;

      case "add-identity":
        if (args.length < 4) {
          console.error("Usage: fix:person add-identity <personId> <type> <value>");
          process.exit(1);
        }
        await handleAddIdentity(args[1], args[2], args[3]);
        break;

      case "delete":
        if (args.length < 2) {
          console.error("Usage: fix:person delete <personId> [--yes]");
          process.exit(1);
        }
        await handleDelete(args[1]);
        break;

      case "search":
        if (args.length < 2) {
          console.error("Usage: fix:person search <query>");
          process.exit(1);
        }
        await handleSearch(args.slice(1).join(" "));
        break;

      case "show":
        if (args.length < 2) {
          console.error("Usage: fix:person show <personId>");
          process.exit(1);
        }
        await handleShow(args[1]);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  closeDb();
  process.exit(1);
});
