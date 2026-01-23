// Command: review:people - Review people and match candidates

import { closeDb } from "../storage/db.js";
import {
  listPeople,
  getPendingMatchCandidates,
  resolveMatchCandidate,
  mergePeople,
  getPerson,
  getPeopleCount,
  getLinkedInConnectionCount,
  getRecentConnections,
  listPeopleToNudge,
} from "../people/repository.js";
import { logSuccess } from "../storage/action-log.js";

function printUsage(): void {
  console.log(`
Usage: npm run review:people -- [command]

Commands:
  (no command)     Show overview and pending match candidates
  matches          Show pending match candidates for review
  recent           Show recent LinkedIn connections
  nudge            Show people to reconnect with
  stats            Show people statistics

Examples:
  npm run review:people
  npm run review:people -- matches
  npm run review:people -- recent
  npm run review:people -- nudge
`);
}

function showOverview(): void {
  console.log("\n" + "=".repeat(50));
  console.log("PEOPLE OVERVIEW");
  console.log("=".repeat(50));

  const totalPeople = getPeopleCount();
  const linkedInConnections = getLinkedInConnectionCount();

  console.log(`\n--- Statistics ---`);
  console.log(`  Total people: ${totalPeople}`);
  console.log(`  LinkedIn connections: ${linkedInConnections}`);

  // Show pending matches
  const pendingMatches = getPendingMatchCandidates();
  if (pendingMatches.length > 0) {
    console.log(`\n--- Pending Match Candidates (${pendingMatches.length}) ---`);
    for (const match of pendingMatches.slice(0, 5)) {
      const person1 = getPerson(match.person_id);
      const person2 = getPerson(match.candidate_person_id);

      console.log(`\n  Match #${match.id}:`);
      console.log(`    ${person1?.display_name || match.person_id}`);
      console.log(`    ↔ ${person2?.display_name || match.candidate_person_id}`);
      console.log(`    Type: ${match.match_type} | Value: ${match.match_value}`);
      console.log(`    Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    }
    if (pendingMatches.length > 5) {
      console.log(`\n  ... and ${pendingMatches.length - 5} more`);
    }
    console.log(`\n  Use "npm run review:people -- matches" to see all`);
  } else {
    console.log(`\n  No pending match candidates.`);
  }

  // Show recent connections
  const recentConnections = getRecentConnections(5);
  if (recentConnections.length > 0) {
    console.log(`\n--- Recent Connections ---`);
    for (const person of recentConnections) {
      console.log(`  • ${person.display_name}`);
      if (person.company) console.log(`    @ ${person.company}`);
      console.log(`    Connected: ${person.connected_on}`);
    }
  }

  // Show nudges
  const nudges = listPeopleToNudge(30, 3);
  if (nudges.length > 0) {
    console.log(`\n--- People to Reconnect With ---`);
    for (const nudge of nudges) {
      console.log(`  • ${nudge.person.display_name}`);
      console.log(`    ${nudge.reason}`);
    }
  }
}

function showPendingMatches(): void {
  const matches = getPendingMatchCandidates();

  console.log("\n" + "=".repeat(50));
  console.log("PENDING MATCH CANDIDATES");
  console.log("=".repeat(50));

  if (matches.length === 0) {
    console.log("\n  No pending match candidates.");
    return;
  }

  console.log(`\n${matches.length} match candidates need review:\n`);

  for (const match of matches) {
    const person1 = getPerson(match.person_id);
    const person2 = getPerson(match.candidate_person_id);

    console.log(`─`.repeat(50));
    console.log(`Match #${match.id}`);
    console.log(`  Person 1: ${person1?.display_name || match.person_id}`);
    if (person1?.company) console.log(`    Company: ${person1.company}`);
    if (person1?.primary_email) console.log(`    Email: ${person1.primary_email}`);

    console.log(`  Person 2: ${person2?.display_name || match.candidate_person_id}`);
    if (person2?.company) console.log(`    Company: ${person2.company}`);
    if (person2?.primary_email) console.log(`    Email: ${person2.primary_email}`);

    console.log(`\n  Match: ${match.match_type} = ${match.match_value}`);
    console.log(`  Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    console.log(`  Created: ${match.created_at}`);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`\nTo approve a match:`);
  console.log(`  npm run fix:person -- merge <primaryId> <secondaryId>`);
  console.log(`\nTo reject (ignore) a match, use the review:people approve/reject commands.`);
}

function showRecentConnections(): void {
  const connections = getRecentConnections(20);

  console.log("\n" + "=".repeat(50));
  console.log("RECENT LINKEDIN CONNECTIONS");
  console.log("=".repeat(50));

  if (connections.length === 0) {
    console.log("\n  No LinkedIn connections found.");
    console.log("  Run: npm run ingest:linkedin -- <path>");
    return;
  }

  for (const person of connections) {
    console.log(`\n• ${person.display_name}`);
    console.log(`  ID: ${person.id}`);
    if (person.company) console.log(`  Company: ${person.company}`);
    if (person.title) console.log(`  Title: ${person.title}`);
    if (person.primary_email) console.log(`  Email: ${person.primary_email}`);
    console.log(`  Connected: ${person.connected_on}`);
  }

  console.log(`\n${connections.length} recent connection(s) shown.`);
}

function showNudges(): void {
  const nudgeDays = parseInt(process.env.PEOPLE_NUDGE_DAYS || "30", 10);
  const nudges = listPeopleToNudge(nudgeDays, 20);

  console.log("\n" + "=".repeat(50));
  console.log("PEOPLE TO RECONNECT WITH");
  console.log("=".repeat(50));
  console.log(`(No interaction in ${nudgeDays} days)`);

  if (nudges.length === 0) {
    console.log("\n  No nudges - you're all caught up!");
    return;
  }

  for (const nudge of nudges) {
    console.log(`\n• ${nudge.person.display_name}`);
    console.log(`  ID: ${nudge.person.id}`);
    if (nudge.person.company) console.log(`  Company: ${nudge.person.company}`);
    if (nudge.person.title) console.log(`  Title: ${nudge.person.title}`);
    console.log(`  ${nudge.reason}`);
    if (nudge.connection_date) console.log(`  Connected: ${nudge.connection_date}`);
  }

  console.log(`\n${nudges.length} people to reconnect with.`);
}

function showStats(): void {
  console.log("\n" + "=".repeat(50));
  console.log("PEOPLE STATISTICS");
  console.log("=".repeat(50));

  const totalPeople = getPeopleCount();
  const linkedInConnections = getLinkedInConnectionCount();
  const pendingMatches = getPendingMatchCandidates().length;

  console.log(`\n  Total people: ${totalPeople}`);
  console.log(`  LinkedIn connections: ${linkedInConnections}`);
  console.log(`  Non-LinkedIn people: ${totalPeople - linkedInConnections}`);
  console.log(`  Pending match candidates: ${pendingMatches}`);

  // Count people with email
  const peopleWithEmail = listPeople({ limit: 10000 }).filter(
    (p) => p.primary_email
  ).length;
  console.log(`\n  People with email: ${peopleWithEmail}`);
  console.log(`  People without email: ${totalPeople - peopleWithEmail}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  try {
    const command = args[0];

    switch (command) {
      case "matches":
        showPendingMatches();
        break;

      case "recent":
        showRecentConnections();
        break;

      case "nudge":
      case "nudges":
        showNudges();
        break;

      case "stats":
        showStats();
        break;

      default:
        showOverview();
        break;
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
