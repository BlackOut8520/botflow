/**
 * Data access for the `flows` table.
 *
 * Kept separate from the Server Actions in `app/actions/flows.ts` so the concurrency
 * rules below can be exercised against a real Postgres engine in `flow-repo.test.ts`.
 * The actions own validation, revalidation and serialization; this module owns SQL.
 */

import { and, desc, eq, sql } from "drizzle-orm"
import type { PgDatabase } from "drizzle-orm/pg-core"
import { flows } from "./schema.ts"
import type { BotEdge, BotNode } from "../flow-types"

/**
 * Any drizzle Postgres database. Intentionally loose: production runs on
 * node-postgres and the tests run on pglite, and the concrete generics differ.
 */
export type FlowDb = PgDatabase<any, any, any>

export interface FlowContent {
  id: string
  name: string
  nodes: BotNode[]
  edges: BotEdge[]
}

export type UpdateOutcome =
  /** Written. `updatedAt` is the new version. */
  | { status: "ok"; updatedAt: Date }
  /** The row moved on since `expectedUpdatedAt`; nothing was written. */
  | { status: "conflict"; updatedAt: Date }
  /** The row no longer exists. */
  | { status: "missing" }

/**
 * Version predicate for optimistic locking.
 *
 * `updated_at` round-trips through JS Dates, which only carry milliseconds, while
 * Postgres stores microseconds — so a row created by `defaultNow()` would never match
 * the value a client read back. Comparing the truncated column removes that mismatch.
 */
function versionMatch(isoTimestamp: string) {
  return sql`date_trunc('milliseconds', ${flows.updatedAt}) = ${isoTimestamp}::timestamptz`
}

/**
 * The timestamp to write on an update.
 *
 * Because the token the browser holds is millisecond-resolution, two writes landing in
 * the same millisecond would produce the same token — and a stale tab saving right after
 * someone else would slip past the version check. Forcing `updated_at` to advance by at
 * least a millisecond on every write keeps every version distinct.
 */
function nextVersion(now: Date) {
  return sql`greatest(${now.toISOString()}::timestamptz, ${flows.updatedAt} + interval '1 millisecond')`
}

export function listFlowSummaries(db: FlowDb) {
  return db
    .select({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt })
    .from(flows)
    .orderBy(desc(flows.updatedAt))
}

export async function getFlowRow(db: FlowDb, id: string) {
  const [row] = await db.select().from(flows).where(eq(flows.id, id)).limit(1)
  return row ?? null
}

export async function insertFlowRow(db: FlowDb, content: FlowContent, now: Date) {
  const [row] = await db
    .insert(flows)
    .values({ ...content, createdAt: now, updatedAt: now })
    .returning()
  return row
}

/**
 * Insert the starter flow, tolerating a concurrent first load.
 * Returns null when another request won the race.
 */
export async function seedFlowRow(db: FlowDb, content: FlowContent) {
  const [row] = await db
    .insert(flows)
    .values(content)
    .onConflictDoNothing()
    .returning({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt })
  return row ?? null
}

/**
 * Replace a flow's nodes and edges.
 *
 * When `expectedUpdatedAt` is set the write only lands if the row is still at that
 * version — this is what stops a stale tab from overwriting newer work. Pass null to
 * overwrite unconditionally (the deliberate "keep mine" action).
 */
export async function updateFlowContent(
  db: FlowDb,
  id: string,
  nodes: BotNode[],
  edges: BotEdge[],
  expectedUpdatedAt: string | null,
  now: Date,
): Promise<UpdateOutcome> {
  const where = expectedUpdatedAt === null ? eq(flows.id, id) : and(eq(flows.id, id), versionMatch(expectedUpdatedAt))
  const [row] = await db
    .update(flows)
    .set({ nodes, edges, updatedAt: nextVersion(now) })
    .where(where)
    .returning({ updatedAt: flows.updatedAt })

  if (row) return { status: "ok", updatedAt: row.updatedAt }

  // Nothing was updated: tell apart "row is gone" from "somebody else wrote first".
  const [current] = await db.select({ updatedAt: flows.updatedAt }).from(flows).where(eq(flows.id, id)).limit(1)
  if (!current) return { status: "missing" }
  return { status: "conflict", updatedAt: current.updatedAt }
}

/** Rename a flow. Returns the new version, or null if the flow is gone. */
export async function renameFlowRow(db: FlowDb, id: string, name: string, now: Date): Promise<Date | null> {
  const [row] = await db
    .update(flows)
    .set({ name, updatedAt: nextVersion(now) })
    .where(eq(flows.id, id))
    .returning({ updatedAt: flows.updatedAt })
  return row ? row.updatedAt : null
}

export async function deleteFlowRow(db: FlowDb, id: string): Promise<void> {
  await db.delete(flows).where(eq(flows.id, id))
}
