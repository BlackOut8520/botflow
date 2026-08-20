"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { BotNode, BotEdge } from "@/lib/flow-types"
import { initialNodes, initialEdges } from "@/lib/initial-flow"
import { isPersistableFlow, parseFlowFile } from "@/lib/flow-io"
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
const MAX_NAME_LENGTH = 120

function newFlowId() {
  return `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface FlowSummary {
  id: string
  name: string
  /**
   * Last write, ISO-8601. Doubles as the optimistic-locking token: a client sends back
   * the value it loaded, and a save whose token no longer matches is refused instead of
   * silently overwriting somebody else's changes.
   */
  updatedAt: string
}

export interface FlowDetail extends FlowSummary {
  nodes: BotNode[]
  edges: BotEdge[]
}

function toSummary(row: { id: string; name: string; updatedAt: Date }): FlowSummary {
  return { id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() }
}

function toDetail(row: { id: string; name: string; nodes: BotNode[]; edges: BotEdge[]; updatedAt: Date }): FlowDetail {
  return { id: row.id, name: row.name, nodes: row.nodes, edges: row.edges, updatedAt: row.updatedAt.toISOString() }
}

/** Reject malformed timestamps before they reach SQL, so a bad token can't force a write. */
function normalizeVersion(value: string | null | undefined): string | null | false {
  if (value === null || value === undefined) return null
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return false
  return new Date(ts).toISOString()
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
  })
  if (seeded) return [toSummary(seeded)]
  // Lost the race: another request seeded it, so read whatever is there now.
  return (await listFlowSummaries(db)).map(toSummary)
}

/**
 * Lightweight freshness probe for the editor's polling loop: the same data as
 * `listFlows`, but it never seeds and never revalidates.
 */
export async function pollFlows(): Promise<FlowSummary[]> {
  return (await listFlowSummaries(db)).map(toSummary)
}

/** Get a single flow with its nodes and edges. */
export async function getFlow(id: string): Promise<FlowDetail | null> {
  const row = await getFlowRow(db, id)
  return row ? toDetail(row) : null
}

/** Create a new flow with just a start node, and return it ready to load. */
export async function createFlow(name = "Nuevo flujo"): Promise<FlowDetail> {
  const startNodes: BotNode[] = [
    { id: "start", type: "bot", position: { x: 0, y: 160 }, data: { kind: "start", label: "Inicio" } },
  ]
  const row = await insertFlowRow(db, { id: newFlowId(), name, nodes: startNodes, edges: [] }, new Date())
  revalidatePath("/")
  return toDetail(row)
}

export type SaveOutcome =
  /** Written. `updatedAt` is the new locking token the client must keep. */
  | { status: "ok"; updatedAt: string }
  /** Somebody else wrote first. Nothing was saved; `updatedAt` is the server's version. */
  | { status: "conflict"; updatedAt: string }
  /** The flow no longer exists. */
  | { status: "missing" }
  /** The payload was structurally invalid and was not written. */
  | { status: "rejected"; reason: string }

/**
 * Persist the nodes/edges of a flow (autosave and the Save button).
 *
 * Pass the `updatedAt` the editor loaded as `expectedUpdatedAt`. If the row moved on
 * since then the write is refused with `conflict` — that is what stops a stale tab from
 * overwriting newer changes. Pass `null` only for a deliberate "overwrite anyway".
 */
export async function saveFlow(
  id: string,
  nodes: BotNode[],
  edges: BotEdge[],
  expectedUpdatedAt: string | null,
): Promise<SaveOutcome> {
  if (!isPersistableFlow(nodes, edges)) {
    return { status: "rejected", reason: "El flujo tiene un formato inválido y no se guardó." }
  }
  const expected = normalizeVersion(expectedUpdatedAt)
  if (expected === false) {
    return { status: "rejected", reason: "La versión enviada es inválida. Recarga la página." }
  }

  const outcome = await updateFlowContent(db, id, nodes, edges, expected, new Date())
  if (outcome.status === "missing") return { status: "missing" }
  return { status: outcome.status, updatedAt: outcome.updatedAt.toISOString() }
}

/** Rename a flow. Returns the new locking token, or null if the flow is gone. */
export async function renameFlow(id: string, name: string): Promise<string | null> {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) return null
  const updatedAt = await renameFlowRow(db, id, trimmed, new Date())
  revalidatePath("/")
  return updatedAt ? updatedAt.toISOString() : null
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
  const row = await insertFlowRow(db, { id: newFlowId(), name, nodes, edges }, new Date())
  revalidatePath("/")
  return { ok: true, flow: toDetail(row), warnings }
}
