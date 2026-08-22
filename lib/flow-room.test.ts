import { test } from "node:test"
import assert from "node:assert/strict"

import { parseFlowFile } from "./flow-io.ts"
import { includeActiveFlow, replaceRoomMapContents, shouldReplaceRoomStorage } from "./flow-room.ts"

const rawImport = JSON.stringify({
  name: "Importado normalizado",
  nodes: [
    {
      id: "start",
      type: "legacy",
      position: { x: 0, y: 160 },
      data: { kind: "start", label: "Inicio nuevo" },
      selected: true,
      measured: { width: 200, height: 80 },
    },
    {
      id: "message",
      type: "bot",
      position: { x: 320, y: 160 },
      data: { kind: "message", label: "Mensaje nuevo", text: "Contenido importado" },
    },
  ],
  edges: [
    { id: "valid", source: "start", target: "message", sourceHandle: "out", targetHandle: null },
    { id: "invalid", source: "start", target: "missing", sourceHandle: "out", targetHandle: null },
  ],
})

function normalizedImport() {
  const result = parseFlowFile(rawImport)
  if (!result.ok) throw new Error(`invalid regression fixture: ${result.error}`)
  assert.ok(result.flow.warnings.length > 0, "the fixture must exercise parser repairs")
  return result.flow
}

test("the imported active flow survives the Room remount in the flow list", () => {
  const parsed = normalizedImport()
  const initialFlows = [{ id: "old-flow", name: "Anterior", updatedAt: "2026-08-20T00:00:00.000Z" }]
  const imported = { id: "imported-flow", name: parsed.name, updatedAt: "2026-08-21T00:00:00.000Z" }

  const remountedFlows = includeActiveFlow(initialFlows, imported)

  assert.deepEqual(remountedFlows.map((flow) => flow.id), ["imported-flow", "old-flow"])
})

test("room replacement waits for loaded storage and only runs once", () => {
  assert.equal(shouldReplaceRoomStorage(true, false, false), false)
  assert.equal(shouldReplaceRoomStorage(true, false, true), true)
  assert.equal(shouldReplaceRoomStorage(true, true, true), false)
  assert.equal(shouldReplaceRoomStorage(false, false, true), false)
})

test("an imported room replaces stale graph state with the normalized parse result", () => {
  const parsed = normalizedImport()
  const roomNodes = new Map<string, (typeof parsed.nodes)[number]>([
    ["start", { ...parsed.nodes[0], data: { ...parsed.nodes[0].data, label: "Inicio viejo" } }],
    ["stale-node", { ...parsed.nodes[1], id: "stale-node" }],
  ])
  const roomEdges = new Map<string, (typeof parsed.edges)[number]>([
    ["valid", { ...parsed.edges[0], target: "stale-node" }],
    ["stale-edge", { ...parsed.edges[0], id: "stale-edge" }],
  ])

  replaceRoomMapContents(roomNodes, parsed.nodes, (node) => structuredClone(node))
  replaceRoomMapContents(roomEdges, parsed.edges, (edge) => structuredClone(edge))

  const immediateExport = {
    name: parsed.name,
    nodes: Array.from(roomNodes.values()),
    edges: Array.from(roomEdges.values()),
  }
  assert.deepEqual(immediateExport, { name: parsed.name, nodes: parsed.nodes, edges: parsed.edges })
})
