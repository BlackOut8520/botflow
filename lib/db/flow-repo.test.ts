/**
 * Integration tests for the flows data layer, run against a real Postgres engine
 * (pglite is Postgres compiled to WASM, so timestamp precision, `date_trunc` and
 * `on conflict` behave exactly as they do in production).
 *
 * These cover the concurrency contract the editor depends on: a save carries the
 * version it loaded, and a stale version must be refused rather than overwrite.
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

/** Insert a row the same way `createFlow` does and hand back its version token. */
async function seedRow(id = "f1") {
  const row = await insertFlowRow(db, { id, name: "Flujo", nodes: [node("start")], edges: [] }, T1)
  return { row, token: row.updatedAt.toISOString() }
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
})

test("a save carrying the current version succeeds and advances it", async () => {
  const { token } = await seedRow()
  const outcome = await updateFlowContent(db, "f1", [node("a")], [], token, T2)
  assert.equal(outcome.status, "ok")
  if (outcome.status !== "ok") return
  assert.notEqual(outcome.updatedAt.toISOString(), token)

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes.length, 1)
  assert.equal(row?.nodes[0].id, "a")
})

test("a token read from a microsecond-precision row still matches", async () => {
  // Real Postgres `now()` — what `defaultNow()` uses for the seeded flow — stores
  // microseconds, while a JS Date (and therefore the token the browser holds) only
  // carries milliseconds. The timestamp is written explicitly here because pglite's
  // clock is millisecond-resolution and could not reproduce the case on its own.
  await client.exec(`
    insert into flows (id, name, nodes, edges, created_at, updated_at)
    values ('micro', 'Micro', '[]'::jsonb, '[]'::jsonb, now(), '2026-08-20T16:04:05.123456+00'::timestamptz)
  `)

  const row = await getFlowRow(db, "micro")
  assert.ok(row)
  const token = row.updatedAt.toISOString()
  assert.equal(token, "2026-08-20T16:04:05.123Z", "the driver is expected to truncate to milliseconds")

  // Precondition: a plain equality check would find nothing, so the truncation in
  // `versionMatch` is what makes the save possible at all.
  const naive = await client.query("select 1 from flows where id = 'micro' and updated_at = $1::timestamptz", [token])
  assert.equal(naive.rows.length, 0, "exact equality must miss here, or this test proves nothing")

  const outcome = await updateFlowContent(db, "micro", [node("a")], [], token, T2)
  assert.equal(outcome.status, "ok", "a sub-millisecond difference must not look like someone else's write")
})

test("seeded flows can be saved on the first try", async () => {
  const seeded = await seedFlowRow(db, { id: "seeded", name: "Ejemplo", nodes: [node("start")], edges: [] })
  assert.ok(seeded)
  const outcome = await updateFlowContent(db, "seeded", [node("a")], [], seeded.updatedAt.toISOString(), T2)
  assert.equal(outcome.status, "ok")
})

test("a stale version is refused and leaves the row untouched", async () => {
  const { token: staleToken } = await seedRow()

  // Another tab saves first.
  const first = await updateFlowContent(db, "f1", [node("theirs")], [], staleToken, T2)
  assert.equal(first.status, "ok")

  // The stale tab now tries to save the state it had.
  const second = await updateFlowContent(db, "f1", [node("mine")], [], staleToken, T2)
  assert.equal(second.status, "conflict")

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes[0].id, "theirs", "the stale save must not overwrite the newer one")
  if (second.status === "conflict") {
    assert.equal(second.updatedAt.toISOString(), row?.updatedAt.toISOString())
  }
})

test("a conflict reports the server's current version so the client can resync", async () => {
  const { token } = await seedRow()
  const first = await updateFlowContent(db, "f1", [node("theirs")], [], token, T2)
  assert.equal(first.status, "ok")
  if (first.status !== "ok") return

  const conflict = await updateFlowContent(db, "f1", [node("mine")], [], token, T2)
  assert.equal(conflict.status, "conflict")
  if (conflict.status !== "conflict") return
  assert.equal(conflict.updatedAt.toISOString(), first.updatedAt.toISOString())

  // Resyncing to the reported version lets the save through.
  const retry = await updateFlowContent(db, "f1", [node("mine")], [], conflict.updatedAt.toISOString(), T2)
  assert.equal(retry.status, "ok")
  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes[0].id, "mine")
})

test("a null version overwrites on purpose (the 'keep mine' action)", async () => {
  const { token } = await seedRow()
  await updateFlowContent(db, "f1", [node("theirs")], [], token, T2)

  const forced = await updateFlowContent(db, "f1", [node("mine")], [], null, T2)
  assert.equal(forced.status, "ok")
  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes[0].id, "mine")
})

test("saving a deleted flow reports missing, not conflict", async () => {
  const { token } = await seedRow()
  await deleteFlowRow(db, "f1")
  const outcome = await updateFlowContent(db, "f1", [node("a")], [], token, T2)
  assert.equal(outcome.status, "missing")
})

test("two writes in the same millisecond still produce different versions", async () => {
  // Without a strictly increasing timestamp both writes would carry the same token and
  // the second, stale one would be accepted.
  const { token } = await seedRow()
  const first = await updateFlowContent(db, "f1", [node("theirs")], [], token, T2)
  assert.equal(first.status, "ok")
  if (first.status !== "ok") return
  assert.notEqual(first.updatedAt.toISOString(), token)

  const second = await updateFlowContent(db, "f1", [node("mine")], [], token, T2)
  assert.equal(second.status, "conflict")

  const row = await getFlowRow(db, "f1")
  assert.equal(row?.nodes[0].id, "theirs")
})

test("the version advances even when the clock goes backwards", async () => {
  const { token } = await seedRow()
  const inThePast = new Date("2020-01-01T00:00:00.000Z")
  const outcome = await updateFlowContent(db, "f1", [node("a")], [], token, inThePast)
  assert.equal(outcome.status, "ok")
  if (outcome.status !== "ok") return
  assert.ok(outcome.updatedAt > new Date(token), "updated_at must never move backwards")
})

test("a rename bumps the version, so the old token stops working", async () => {
  const { token } = await seedRow()
  const renamed = await renameFlowRow(db, "f1", "Otro nombre", T1)
  assert.ok(renamed)
  assert.notEqual(renamed.toISOString(), token)

  const stale = await updateFlowContent(db, "f1", [node("a")], [], token, T2)
  assert.equal(stale.status, "conflict")

  const fresh = await updateFlowContent(db, "f1", [node("a")], [], renamed.toISOString(), T2)
  assert.equal(fresh.status, "ok")
  const row = await getFlowRow(db, "f1")
  assert.equal(row?.name, "Otro nombre", "saving content must not revert the name")
})

test("renaming a missing flow returns null", async () => {
  assert.equal(await renameFlowRow(db, "nope", "x", T1), null)
})

test("seeding twice with the same id does not duplicate the row", async () => {
  const first = await seedFlowRow(db, { id: "seed", name: "Ejemplo", nodes: [], edges: [] })
  const second = await seedFlowRow(db, { id: "seed", name: "Ejemplo", nodes: [], edges: [] })
  assert.ok(first)
  assert.equal(second, null, "the losing racer must get null, not a duplicate")
  const all = await listFlowSummaries(db)
  assert.equal(all.length, 1)
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
