"use server"

import { db } from "@/lib/db"
import { flows } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { BotNode, BotEdge } from "@/lib/flow-types"
import { initialNodes, initialEdges } from "@/lib/initial-flow"

function newFlowId() {
  return `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface FlowSummary {
  id: string
  name: string
  updatedAt: string
}

export interface FlowDetail extends FlowSummary {
  nodes: BotNode[]
  edges: BotEdge[]
}

/** List all flows (most recently updated first). Seeds a starter flow if empty. */
export async function listFlows(): Promise<FlowSummary[]> {
  const rows = await db
    .select({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt })
    .from(flows)
    .orderBy(desc(flows.updatedAt))

  if (rows.length === 0) {
    // Fixed id + onConflictDoNothing makes concurrent first-loads idempotent
    // (no duplicate seed rows even if several requests race here).
    const id = "seed-ejemplo"
    await db
      .insert(flows)
      .values({ id, name: "Flujo de ejemplo", nodes: initialNodes, edges: initialEdges })
      .onConflictDoNothing()
    return [{ id, name: "Flujo de ejemplo", updatedAt: new Date().toISOString() }]
  }

  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() }))
}

/** Get a single flow with its nodes and edges. */
export async function getFlow(id: string): Promise<FlowDetail | null> {
  const [row] = await db.select().from(flows).where(eq(flows.id, id)).limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    nodes: row.nodes,
    edges: row.edges,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Create a new (empty-ish) flow with just a start node. */
export async function createFlow(name = "Nuevo flujo"): Promise<FlowSummary> {
  const id = newFlowId()
  const startNodes: BotNode[] = [
    { id: "start", type: "bot", position: { x: 0, y: 160 }, data: { kind: "start", label: "Inicio" } },
  ]
  await db.insert(flows).values({ id, name, nodes: startNodes, edges: [] })
  revalidatePath("/")
  return { id, name, updatedAt: new Date().toISOString() }
}

/** Persist the nodes/edges of a flow (used by autosave). */
export async function saveFlow(id: string, nodes: BotNode[], edges: BotEdge[]): Promise<void> {
  await db
    .update(flows)
    .set({ nodes, edges, updatedAt: new Date() })
    .where(eq(flows.id, id))
}

/** Rename a flow. */
export async function renameFlow(id: string, name: string): Promise<void> {
  await db
    .update(flows)
    .set({ name, updatedAt: new Date() })
    .where(eq(flows.id, id))
  revalidatePath("/")
}

/** Delete a flow. */
export async function deleteFlow(id: string): Promise<void> {
  await db.delete(flows).where(eq(flows.id, id))
  revalidatePath("/")
}

/** Import a flow with custom nodes and edges. */
export async function importFlow(name: string, nodes: BotNode[], edges: BotEdge[]): Promise<FlowSummary> {
  const id = newFlowId()
  await db.insert(flows).values({ id, name, nodes, edges })
  revalidatePath("/")
  return { id, name, updatedAt: new Date().toISOString() }
}

