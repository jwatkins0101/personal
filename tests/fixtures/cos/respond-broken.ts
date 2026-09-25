// Negative fixture for gate:respond: every answer just marks the item done (no spam move, no hold).
export * from "../../../src/cos/approvals.ts";
import { markDone } from "../../../src/cos/approvals.ts";
import type Database from "better-sqlite3";
export async function respond(db: Database.Database, _ex: unknown, d: string, n: number) { return markDone(db, d, n, "by you"); }
