/**
 * Data access for the `flows` table.
 *
 * Kept separate from the Server Actions in `app/actions/flows.ts` so it can be
 * exercised against a real Postgres engine in `flow-repo.test.ts`. The actions own
 * validation, revalidation and serialization; this module owns SQL.
 */

import { desc, eq } from "drizzle-orm"
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
  /** Labels for the flow's paths, keyed by path id. Defaults to empty. */
  pathNames?: Record<string, string>
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
    .values({ ...content, pathNames: content.pathNames ?? {}, createdAt: now, updatedAt: now })
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
    .values({ ...content, pathNames: content.pathNames ?? {} })
    .onConflictDoNothing()
    .returning({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt })
  return row ?? null
}

/**
 * Replace a flow's nodes and edges. Returns false when the flow no longer exists.
 *
 * `pathNames` is written only when it is provided: a caller that does not track path
 * names (or has not loaded them yet) must not blank out the labels already stored.
 * There is no version check — every connected client edits the same live Liveblocks
 * document, so their autosaves are expected to overwrite each other.
 */
export async function updateFlowContent(
  db: FlowDb,
  id: string,
  nodes: BotNode[],
  edges: BotEdge[],
  pathNames: Record<string, string> | undefined,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .update(flows)
    .set({ nodes, edges, ...(pathNames ? { pathNames } : {}), updatedAt: now })
    .where(eq(flows.id, id))
    .returning({ id: flows.id })
  return row !== undefined
}

/** Rename a flow. Returns false when the flow no longer exists. */
export async function renameFlowRow(db: FlowDb, id: string, name: string, now: Date): Promise<boolean> {
  const [row] = await db
    .update(flows)
    .set({ name, updatedAt: now })
    .where(eq(flows.id, id))
    .returning({ id: flows.id })
  return row !== undefined
}

export async function deleteFlowRow(db: FlowDb, id: string): Promise<void> {
  await db.delete(flows).where(eq(flows.id, id))
}
