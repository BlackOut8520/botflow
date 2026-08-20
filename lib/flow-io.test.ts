/**
 * Contract tests for the flow import boundary.
 *
 * Run with: `npm run test:io` (plain `node --test`, no bundler or node_modules needed).
 * The `.ts` specifier is required by Node's native type stripping.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { parseFlowFile, isPersistableFlow, MAX_NODES } from "./flow-io.ts"

/**
 * Deliberately permissive stand-ins for on-disk data: an imported file is untrusted,
 * so the tests need to write shapes the editor's own types would never allow.
 */
interface RawNode {
  id?: unknown
  type?: unknown
  position?: { x?: unknown; y?: unknown }
  data?: Record<string, any>
  [key: string]: unknown
}
interface RawEdge {
  id?: unknown
  source?: unknown
  target?: unknown
  sourceHandle?: unknown
  targetHandle?: unknown
}
interface RawFlow {
  name?: unknown
  nodes: RawNode[]
  edges: RawEdge[]
}

/** A minimal but realistic export payload, matching what handleExportFlow writes. */
function sampleFlow(): RawFlow {
  return {
    name: "Flujo de ventas",
    nodes: [
      { id: "start", type: "bot", position: { x: 0, y: 160 }, data: { kind: "start", label: "Inicio" } },
      {
        id: "q1",
        type: "bot",
        position: { x: 320, y: 160 },
        data: {
          kind: "question",
          label: "¿Qué deseas?",
          text: "¿Qué deseas hacer?",
          options: [
            { id: "opt-a", label: "Inscribirme" },
            { id: "opt-b", label: "Información" },
          ],
        },
      },
      { id: "m1", type: "bot", position: { x: 700, y: 60 }, data: { kind: "message", label: "Gracias" } },
      { id: "e1", type: "bot", position: { x: 700, y: 300 }, data: { kind: "end", label: "Fin" } },
    ],
    edges: [
      { id: "s-q", source: "start", target: "q1", sourceHandle: "out", targetHandle: null },
      { id: "q-m", source: "q1", target: "m1", sourceHandle: "opt-a", targetHandle: null },
      { id: "q-e", source: "q1", target: "e1", sourceHandle: "opt-b", targetHandle: null },
    ],
  }
}

function parse(payload: unknown, fallback = "Importado") {
  return parseFlowFile(JSON.stringify(payload), fallback)
}

function expectOk(result: ReturnType<typeof parseFlowFile>) {
  assert.equal(result.ok, true, `expected ok, got: ${result.ok === false ? result.error : ""}`)
  if (result.ok !== true) throw new Error("unreachable")
  return result.flow
}

// ---------- golden path ----------

test("round-trips a valid export without warnings", () => {
  const flow = expectOk(parse(sampleFlow()))
  assert.equal(flow.name, "Flujo de ventas")
  assert.equal(flow.nodes.length, 4)
  assert.equal(flow.edges.length, 3)
  assert.deepEqual(flow.warnings, [])
  assert.equal(flow.nodes[1].data.options?.length, 2)
  assert.equal(flow.edges[1].sourceHandle, "opt-a")
})

test("forces every node onto the registered bot node type", () => {
  const payload = sampleFlow()
  payload.nodes[2].type = "default"
  const flow = expectOk(parse(payload))
  assert.ok(flow.nodes.every((n) => n.type === "bot"))
})

test("keeps unknown data fields so newer exports are not truncated", () => {
  const payload = sampleFlow()
  payload.nodes[2].data!.futureField = { a: 1 }
  const flow = expectOk(parse(payload))
  assert.deepEqual((flow.nodes[2].data as Record<string, unknown>).futureField, { a: 1 })
})

test("strips transient editor state", () => {
  const payload = sampleFlow()
  payload.nodes[0].selected = true
  payload.nodes[0].dragging = true
  payload.nodes[0].measured = { width: 200, height: 80 }
  const flow = expectOk(parse(payload))
  assert.equal("selected" in flow.nodes[0], false)
  assert.equal("dragging" in flow.nodes[0], false)
  assert.equal("measured" in flow.nodes[0], false)
})

// ---------- hard rejections ----------

test("rejects non-JSON, empty and non-object payloads", () => {
  assert.equal(parseFlowFile("not json at all").ok, false)
  assert.equal(parseFlowFile("").ok, false)
  assert.equal(parseFlowFile("   ").ok, false)
  assert.equal(parseFlowFile("[]").ok, false)
  assert.equal(parseFlowFile("null").ok, false)
  assert.equal(parseFlowFile('"a string"').ok, false)
})

test("rejects a missing or non-array nodes list", () => {
  assert.equal(parse({ name: "x" }).ok, false)
  assert.equal(parse({ name: "x", nodes: {} }).ok, false)
  assert.equal(parse({ name: "x", nodes: "start" }).ok, false)
})

test("rejects a non-array edges list instead of importing garbage", () => {
  const payload = { ...sampleFlow(), edges: { a: 1 } }
  const result = parse(payload)
  assert.equal(result.ok, false)
  if (result.ok === false) assert.match(result.error, /edges/)
})

test("rejects a file whose nodes are all invalid", () => {
  const result = parse({ name: "x", nodes: [{ foo: 1 }, "nope", null] })
  assert.equal(result.ok, false)
})

test("rejects an oversized node list", () => {
  const nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) => ({
    id: `n${i}`,
    position: { x: 0, y: 0 },
    data: { kind: "message", label: "m" },
  }))
  assert.equal(parse({ name: "big", nodes }).ok, false)
})

// ---------- repairs the user must be told about ----------

test("drops nodes with an unknown kind (they crash the renderer)", () => {
  const payload = sampleFlow()
  payload.nodes.push({
    id: "weird",
    type: "bot",
    position: { x: 0, y: 0 },
    data: { kind: "webhook", label: "Webhook" },
  })
  const flow = expectOk(parse(payload))
  assert.equal(flow.nodes.length, 4)
  assert.ok(flow.warnings.some((w) => /formato inválido/.test(w)))
})

test("drops duplicate node ids", () => {
  const payload = sampleFlow()
  payload.nodes.push({ id: "m1", type: "bot", position: { x: 9, y: 9 }, data: { kind: "message", label: "dup" } })
  const flow = expectOk(parse(payload))
  assert.equal(flow.nodes.filter((n) => n.id === "m1").length, 1)
  assert.ok(flow.warnings.some((w) => /id repetido/.test(w)))
})

test("repairs missing or non-numeric positions onto a grid", () => {
  const payload = sampleFlow()
  delete payload.nodes[2].position
  payload.nodes[3].position = { x: "700", y: null }
  const flow = expectOk(parse(payload))
  for (const node of flow.nodes) {
    assert.equal(Number.isFinite(node.position.x), true)
    assert.equal(Number.isFinite(node.position.y), true)
  }
  // Repaired nodes must not all land on the same spot.
  assert.notDeepEqual(flow.nodes[2].position, flow.nodes[3].position)
  assert.ok(flow.warnings.some((w) => /posición/.test(w)))
})

test("drops edges whose endpoints do not exist", () => {
  const payload = sampleFlow()
  payload.edges.push({ id: "ghost", source: "q1", target: "does-not-exist", sourceHandle: "opt-a", targetHandle: null })
  payload.edges.push({ id: "ghost2", source: "nope", target: "m1", sourceHandle: "out", targetHandle: null })
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.length, 3)
  assert.ok(flow.warnings.some((w) => /nodo inexistente/.test(w)))
})

test("drops edges pointing at a start node, which has no target handle", () => {
  const payload = sampleFlow()
  payload.edges.push({ id: "back", source: "m1", target: "start", sourceHandle: "out", targetHandle: null })
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.some((e) => e.target === "start"), false)
})

test("drops edges leaving an end node, which has no outputs", () => {
  const payload = sampleFlow()
  payload.edges.push({ id: "after-end", source: "e1", target: "m1", sourceHandle: "out", targetHandle: null })
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.some((e) => e.source === "e1"), false)
  assert.ok(flow.warnings.some((w) => /salida ya no existe/.test(w)))
})

test("drops branch edges whose handle no longer matches an option id", () => {
  const payload = sampleFlow()
  payload.edges[1].sourceHandle = "opt-deleted"
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.length, 2)
  assert.ok(flow.warnings.some((w) => /salida ya no existe/.test(w)))
})

test("drops branch edges with no handle: the simulator would dead-end", () => {
  const payload = sampleFlow()
  payload.edges[1].sourceHandle = null
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.length, 2)
})

test("infers the single 'out' handle when an older export omitted it", () => {
  const payload = sampleFlow()
  payload.edges[0].sourceHandle = null
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges[0].sourceHandle, "out")
})

test("clears stray target handles that would make the edge invisible", () => {
  const payload = sampleFlow()
  payload.edges[0].targetHandle = "in"
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges[0].targetHandle, null)
  assert.ok(flow.warnings.some((w) => /punto de entrada/.test(w)))
})

test("deduplicates repeated edge ids", () => {
  const payload = sampleFlow()
  payload.edges[2].id = payload.edges[1].id
  const flow = expectOk(parse(payload))
  assert.equal(flow.edges.length, 3)
  assert.equal(new Set(flow.edges.map((e) => e.id)).size, 3)
})

test("generates ids for options and branches that lack them, and keeps edges routable", () => {
  const payload = sampleFlow()
  delete payload.nodes[1].data!.options[1].id
  const flow = expectOk(parse(payload))
  const options = flow.nodes[1].data.options ?? []
  assert.equal(options.length, 2)
  assert.ok(options.every((o) => typeof o.id === "string" && o.id.length > 0))
  // The edge that referenced the now-regenerated option can no longer be routed.
  assert.equal(flow.edges.some((e) => e.sourceHandle === "opt-b"), false)
  assert.ok(flow.warnings.some((w) => /identificador/.test(w)))
})

test("drops options that share an id inside the same node", () => {
  const payload = sampleFlow()
  payload.nodes[1].data!.options.push({ id: "opt-a", label: "Duplicada" })
  const flow = expectOk(parse(payload))
  assert.equal(flow.nodes[1].data.options?.length, 2)
  assert.ok(flow.warnings.some((w) => /opción/.test(w)))
})

test("ignores option/branch fields that are not lists", () => {
  const payload = sampleFlow()
  payload.nodes[1].data!.options = "opt-a,opt-b"
  const flow = expectOk(parse(payload))
  assert.equal(flow.nodes[1].data.options, undefined)
  // With no options there are no branch handles left, so both branch edges go away.
  assert.equal(flow.edges.length, 1)
  assert.ok(flow.warnings.some((w) => /listas/.test(w)))
})

test("clamps out-of-range date branches", () => {
  const payload: RawFlow = {
    name: "fechas",
    nodes: [
      {
        id: "d1",
        position: { x: 0, y: 0 },
        data: {
          kind: "date_condition",
          label: "Fechas",
          dateBranches: [{ id: "db1", label: "Malo", startDay: 0, startMonth: 44, endDay: 99, endMonth: -3 }],
        },
      },
    ],
    edges: [],
  }
  const flow = expectOk(parse(payload))
  const branch = flow.nodes[0].data.dateBranches?.[0]
  assert.deepEqual(
    { sd: branch?.startDay, sm: branch?.startMonth, ed: branch?.endDay, em: branch?.endMonth },
    { sd: 1, sm: 12, ed: 31, em: 1 },
  )
  assert.ok(flow.warnings.some((w) => /rango\(s\) de fecha/.test(w)))
})

test("replaces unknown condition operators with a safe default", () => {
  const payload: RawFlow = {
    name: "cond",
    nodes: [
      {
        id: "c1",
        position: { x: 0, y: 0 },
        data: {
          kind: "condition",
          label: "Cond",
          branches: [
            { id: "b1", label: "R", logic: "and", rules: [{ id: "r1", variable: "x", operator: "regex", value: "1" }] },
          ],
        },
      },
    ],
    edges: [],
  }
  const flow = expectOk(parse(payload))
  assert.equal(flow.nodes[0].data.branches?.[0].rules?.[0].operator, "equals")
  assert.ok(flow.warnings.some((w) => /operador/.test(w)))
})

// ---------- naming ----------

test("falls back to the provided name when the file has none", () => {
  const payload = sampleFlow()
  delete payload.name
  const flow = expectOk(parse(payload, "ventas_botflow"))
  assert.equal(flow.name, "ventas_botflow")
})

test("truncates absurdly long names", () => {
  const flow = expectOk(parse({ ...sampleFlow(), name: "x".repeat(500) }))
  assert.equal(flow.name.length, 120)
})

// ---------- warnings about the flow itself ----------

test("warns when there is no start node", () => {
  const payload = sampleFlow()
  payload.nodes = payload.nodes.filter((n) => n.data!.kind !== "start")
  payload.edges = []
  const flow = expectOk(parse(payload))
  assert.ok(flow.warnings.some((w) => /no tiene nodo de Inicio/.test(w)))
})

test("warns when there are several start nodes", () => {
  const payload = sampleFlow()
  payload.nodes.push({ id: "start2", type: "bot", position: { x: 0, y: 400 }, data: { kind: "start", label: "Inicio 2" } })
  const flow = expectOk(parse(payload))
  assert.ok(flow.warnings.some((w) => /2 nodos de Inicio/.test(w)))
})

// ---------- save guard ----------

test("isPersistableFlow accepts what the editor produces", () => {
  const payload = sampleFlow()
  assert.equal(isPersistableFlow(payload.nodes, payload.edges), true)
})

test("isPersistableFlow refuses structurally broken payloads", () => {
  assert.equal(isPersistableFlow(null, []), false)
  assert.equal(isPersistableFlow([], {}), false)
  assert.equal(isPersistableFlow([{ id: "a", data: { kind: "message" } }], []), false)
  assert.equal(isPersistableFlow([{ id: "a", position: { x: 0, y: 0 }, data: { kind: "nope" } }], []), false)
  assert.equal(isPersistableFlow([{ id: "", position: { x: 0, y: 0 }, data: { kind: "message" } }], []), false)
  assert.equal(isPersistableFlow([{ id: "a", position: { x: 0, y: 0 }, data: { kind: "message" } }], [{ source: "a" }]), false)
})

test("isPersistableFlow allows an empty canvas", () => {
  assert.equal(isPersistableFlow([], []), true)
})
