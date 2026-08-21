/**
 * Integration tests for the flows data layer, run against a real Postgres engine
 * (pglite is Postgres compiled to WASM, so jsonb round-trips, timestamps and
 * `on conflict` behave exactly as they do in production).
 *
 * Run with: `npm run test:db`
 */
import { test, before, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { getTableColumns } from "drizzle-orm"

import type { BotNode } from "../flow-types"

import { flows } from "./schema.ts"
import {
  deleteFlowRow,
  getFlowRow,
  insertFlowRow,
  listFlowSummaries,
  renameFlowRow,
  seedFlowRow,
  updateFlowContent,
  type FlowDb,
} from "./flow-repo.ts"

/**
 * DDL for the `flows` table. Must mirror lib/db/schema.ts — the column check in
 * "schema and test DDL agree" fails loudly if the two drift apart.
 */
const DDL = `
  create table flows (
    id text primary key,
    name text not null default 'Flujo sin título',
    nodes jsonb not null default '[]'::jsonb,
    edges jsonb not null default '[]'::jsonb,
    path_names jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`

let client: PGlite
let db: FlowDb

/** Fixed instants, so the tests never depend on how fast the machine runs. */
const T1 = new Date("2026-08-20T16:00:00.000Z")
const T2 = new Date("2026-08-20T16:00:05.000Z")

const node = (id: string): BotNode => ({
  id,
  type: "bot",
  position: { x: 0, y: 0 },
  data: { kind: "message", label: id },
})

before(async () => {
  client = new PGlite()
  await client.exec(DDL)
  db = drizzle(client) as unknown as FlowDb
})

after(async () => {
  await client.close()
})

beforeEach(async () => {
  await client.exec("truncate table flows;")
})

/** Insert a row the same way `createFlow` does. */
async function seedRow(id = "f1", pathNames?: Record<string, string>) {
  return insertFlowRow(db, { id, name: "Flujo", nodes: [node("start")], edges: [], pathNames }, T1)
}

test("schema and test DDL agree on the column set", async () => {
  const result = await client.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'flows'",
  )
  const inDb = result.rows.map((r) => r.column_name).sort()
  const inSchema = Object.values(getTableColumns(flows))
    .map((column) => column.name)
    .sort()
  assert.deepEqual(inDb, inSchema)
  assert.ok(inDb.includes("path_names"), "the path_names column must exist")
})

test("a save replaces the nodes and edges and advances updated_at", async () => {
  const created = await seedRow()
  const saved = await updateFlowContent(db, "f1", [node("a")], [], undefined, T2)
  assert.equal(saved, true)

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes.length, 1)
  assert.equal(row?.nodes[0].id, "a")
  assert.equal(row?.updatedAt.toISOString(), T2.toISOString())
  assert.ok(row!.updatedAt > created.updatedAt)
})

test("a save does not revert the name", async () => {
  await seedRow()
  assert.equal(await renameFlowRow(db, "f1", "Otro nombre", T1), true)
  assert.equal(await updateFlowContent(db, "f1", [node("a")], [], undefined, T2), true)

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.name, "Otro nombre")
  assert.equal(row?.nodes[0].id, "a")
})

test("saving a deleted flow returns false", async () => {
  await seedRow()
  await deleteFlowRow(db, "f1")
  assert.equal(await updateFlowContent(db, "f1", [node("a")], [], undefined, T2), false)
  assert.equal(await getFlowRow(db, "f1"), null)
})

test("path names survive the jsonb round trip", async () => {
  const pathNames = { "opt-a": "Inscripción", "opt-b": "Informes", start: "Ruta principal" }
  await seedRow("f1", pathNames)
  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.pathNames, pathNames)
})

test("an insert without path names stores an empty object, never null", async () => {
  await seedRow()
  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.pathNames, {})
})

test("a content save without path names keeps the stored ones", async () => {
  // Autosave from a client that does not track path names must not blank the labels.
  await seedRow("f1", { "opt-a": "Inscripción" })
  assert.equal(await updateFlowContent(db, "f1", [node("a")], [], undefined, T2), true)

  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.pathNames, { "opt-a": "Inscripción" })
  assert.equal(row?.nodes[0].id, "a")
})

test("a content save with path names replaces them", async () => {
  await seedRow("f1", { "opt-a": "Inscripción" })
  assert.equal(await updateFlowContent(db, "f1", [node("a")], [], { "opt-b": "Informes" }, T2), true)

  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.pathNames, { "opt-b": "Informes" })
})

test("path names can be cleared explicitly with an empty object", async () => {
  await seedRow("f1", { "opt-a": "Inscripción" })
  assert.equal(await updateFlowContent(db, "f1", [node("a")], [], {}, T2), true)

  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.pathNames, {})
})

test("a rename changes only the name", async () => {
  await seedRow("f1", { "opt-a": "Inscripción" })
  assert.equal(await renameFlowRow(db, "f1", "Otro nombre", T2), true)

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.name, "Otro nombre")
  assert.equal(row?.nodes[0].id, "start")
  assert.deepEqual(row?.pathNames, { "opt-a": "Inscripción" })
  assert.equal(row?.updatedAt.toISOString(), T2.toISOString())
})

test("renaming a missing flow returns false", async () => {
  assert.equal(await renameFlowRow(db, "nope", "x", T1), false)
})

test("seeding twice with the same id does not duplicate the row", async () => {
  const first = await seedFlowRow(db, { id: "seed", name: "Ejemplo", nodes: [], edges: [] })
  const second = await seedFlowRow(db, { id: "seed", name: "Ejemplo", nodes: [], edges: [] })
  assert.ok(first)
  assert.equal(second, null, "the losing racer must get null, not a duplicate")
  const all = await listFlowSummaries(db)
  assert.equal(all.length, 1)
})

test("a seeded flow stores its path names and can be saved right away", async () => {
  const seeded = await seedFlowRow(db, {
    id: "seeded",
    name: "Ejemplo",
    nodes: [node("start")],
    edges: [],
    pathNames: { "opt-a": "Inscripción" },
  })
  assert.ok(seeded)
  assert.deepEqual((await getFlowRow(db, "seeded"))?.pathNames, { "opt-a": "Inscripción" })
  assert.equal(await updateFlowContent(db, "seeded", [node("a")], [], undefined, T2), true)
  assert.deepEqual((await getFlowRow(db, "seeded"))?.pathNames, { "opt-a": "Inscripción" })
})

test("summaries come back newest first", async () => {
  await insertFlowRow(db, { id: "old", name: "Viejo", nodes: [], edges: [] }, new Date("2026-01-01T00:00:00.000Z"))
  await insertFlowRow(db, { id: "new", name: "Nuevo", nodes: [], edges: [] }, new Date("2026-06-01T00:00:00.000Z"))
  const list = await listFlowSummaries(db)
  assert.deepEqual(list.map((f) => f.id), ["new", "old"])
})

test("nodes and edges survive the jsonb round trip unchanged", async () => {
  const nodes = [
    {
      id: "q1",
      type: "bot",
      position: { x: 12.5, y: -40 },
      data: {
        kind: "question",
        label: "¿Qué deseas?",
        options: [{ id: "opt-a", label: "Inscribirme", startMonth: 7, endMonth: 12 }],
      },
    },
  ]
  const edges = [{ id: "e1", source: "q1", target: "m1", sourceHandle: "opt-a", targetHandle: null }]
  await insertFlowRow(db, { id: "f1", name: "Round trip", nodes: nodes as never, edges: edges as never }, T1)
  const row = await getFlowRow(db, "f1")
  assert.deepEqual(row?.nodes, nodes)
  assert.deepEqual(row?.edges, edges)
})

test("getFlowRow returns null for an unknown id", async () => {
  assert.equal(await getFlowRow(db, "nope"), null)
})
