"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { BotNode, BotEdge } from "@/lib/flow-types"
import { initialNodes, initialEdges } from "@/lib/initial-flow"
import { isPersistableFlow, parseFlowFile, MAX_NAME_LENGTH } from "@/lib/flow-io"
import {
  deleteFlowRow,
  getFlowRow,
  insertFlowRow,
  listFlowSummaries,
  renameFlowRow,
  seedFlowRow,
  updateFlowContent,
} from "@/lib/db/flow-repo"

const SEED_ID = "seed-ejemplo"

function newFlowId() {
  return `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface FlowSummary {
  id: string
  name: string
  /** Last write, ISO-8601. */
  updatedAt: string
}

export interface FlowDetail extends FlowSummary {
  nodes: BotNode[]
  edges: BotEdge[]
  /** Labels for the flow's paths, keyed by path id. */
  pathNames: Record<string, string>
}

function toSummary(row: { id: string; name: string; updatedAt: Date }): FlowSummary {
  return { id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() }
}

function toDetail(row: {
  id: string
  name: string
  nodes: BotNode[]
  edges: BotEdge[]
  pathNames: Record<string, string> | null
  updatedAt: Date
}): FlowDetail {
  return {
    id: row.id,
    name: row.name,
    nodes: row.nodes,
    edges: row.edges,
    pathNames: row.pathNames || {},
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** List all flows (most recently updated first). Seeds a starter flow if empty. */
export async function listFlows(): Promise<FlowSummary[]> {
  const rows = await listFlowSummaries(db)
  if (rows.length > 0) return rows.map(toSummary)

  // Fixed id + onConflictDoNothing makes concurrent first-loads idempotent
  // (no duplicate seed rows even if several requests race here).
  const seeded = await seedFlowRow(db, {
    id: SEED_ID,
    name: "Flujo de ejemplo",
    nodes: initialNodes,
    edges: initialEdges,
    pathNames: {},
  })
  if (seeded) return [toSummary(seeded)]
  // Lost the race: another request seeded it, so read whatever is there now.
  return (await listFlowSummaries(db)).map(toSummary)
}

/** Get a single flow with its nodes, edges and path names. */
export async function getFlow(id: string): Promise<FlowDetail | null> {
  const row = await getFlowRow(db, id)
  return row ? toDetail(row) : null
}

/** Create a new flow with just a start node, and return it ready to load. */
export async function createFlow(name = "Nuevo flujo"): Promise<FlowDetail> {
  const startNodes: BotNode[] = [
    { id: "start", type: "bot", position: { x: 0, y: 160 }, data: { kind: "start", label: "Inicio" } },
  ]
  const row = await insertFlowRow(
    db,
    { id: newFlowId(), name, nodes: startNodes, edges: [], pathNames: {} },
    new Date(),
  )
  revalidatePath("/")
  return toDetail(row)
}

export type SaveResult = { ok: true } | { ok: false; reason: string }

/**
 * Persist the nodes/edges/path names of a flow (autosave and the Save button).
 *
 * The payload is validated here — a Server Action is a public HTTP endpoint, so a
 * structurally broken flow must never reach the `flows` table. Omitting `pathNames`
 * leaves the stored labels untouched instead of blanking them.
 */
export async function saveFlow(
  id: string,
  nodes: BotNode[],
  edges: BotEdge[],
  pathNames?: Record<string, string>,
): Promise<SaveResult> {
  if (!isPersistableFlow(nodes, edges)) {
    return { ok: false, reason: "El flujo tiene un formato inválido y no se guardó." }
  }
  const saved = await updateFlowContent(db, id, nodes, edges, pathNames, new Date())
  if (!saved) return { ok: false, reason: "El flujo ya no existe. Recarga la página." }
  return { ok: true }
}

/** Rename a flow. A blank name is ignored. */
export async function renameFlow(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) return
  await renameFlowRow(db, id, trimmed, new Date())
  revalidatePath("/")
}

/** Delete a flow. */
export async function deleteFlow(id: string): Promise<void> {
  await deleteFlowRow(db, id)
  revalidatePath("/")
}

export type ImportOutcome = { ok: true; flow: FlowDetail; warnings: string[] } | { ok: false; error: string }

/**
 * Import a flow from the raw contents of an exported JSON file.
 *
 * The file text is parsed and validated here — not in the browser — because a Server
 * Action is a public HTTP endpoint: client-side checks alone would let anything be
 * written into the `flows` table.
 */
export async function importFlowFromJson(rawJson: string, fallbackName = "Flujo importado"): Promise<ImportOutcome> {
  const parsed = parseFlowFile(rawJson, fallbackName)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const { name, nodes, edges, warnings } = parsed.flow
  // The file format carries no path names, so the imported flow starts with none.
  const row = await insertFlowRow(db, { id: newFlowId(), name, nodes, edges, pathNames: {} }, new Date())
  revalidatePath("/")
  return { ok: true, flow: toDetail(row), warnings }
}
