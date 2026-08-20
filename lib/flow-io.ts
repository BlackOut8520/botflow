/**
 * Parsing, validation and normalization of Botflow flow files — the JSON produced by
 * the "Exportar flujo" button.
 *
 * This module is the single gate for untrusted flow data. The import UI hands the raw
 * file text straight to the `importFlowFromJson` Server Action, which runs
 * `parseFlowFile` before anything reaches the database: Server Actions are public HTTP
 * endpoints, so validating only in the browser would leave the table wide open.
 *
 * It deliberately has no runtime imports (only `import type`) so it can be unit-tested
 * with `node --test` without a bundler or node_modules.
 */

import type {
  BotEdge,
  BotNode,
  BotNodeData,
  ConditionBranch,
  ConditionRule,
  DateBranch,
  NodeKind,
  QuestionOption,
} from "./flow-types"

/** Server Actions accept ~1MB bodies by default; refuse bigger files up front. */
export const MAX_FLOW_FILE_BYTES = 900_000
export const MAX_NODES = 2_000
export const MAX_EDGES = 6_000
export const MAX_NAME_LENGTH = 120

/**
 * Exhaustive map of the node kinds we accept. Typed as `Record<NodeKind, true>` so that
 * adding a kind to `NodeKind` without adding it here is a compile error.
 */
const KIND_SET: Record<NodeKind, true> = {
  start: true,
  message: true,
  question: true,
  input: true,
  condition: true,
  date_condition: true,
  action: true,
  end: true,
}

/**
 * Fallback labels for nodes that arrive without one. Mirrors `NODE_KINDS[kind].title`;
 * kept local (and exhaustively typed) so this module stays runtime-import free.
 */
const FALLBACK_LABEL: Record<NodeKind, string> = {
  start: "Inicio",
  message: "Mensaje del bot",
  question: "Pregunta con opciones",
  input: "Entrada de texto",
  condition: "Condición / Lógica",
  date_condition: "Condición de Fecha",
  action: "Acción / API",
  end: "Fin",
}

/** Kinds whose outgoing handles are one-per-branch instead of a single "out". */
const MULTI_OUT_KINDS = new Set<NodeKind>(["question", "condition", "date_condition"])
/** Kinds with exactly one outgoing handle, whose id is always "out". */
const SINGLE_OUT_KINDS = new Set<NodeKind>(["start", "message", "input", "action"])

const OPERATORS = new Set(["equals", "not_equals", "contains", "empty", "not_empty"])

export interface ParsedFlow {
  name: string
  nodes: BotNode[]
  edges: BotEdge[]
  /** Non-fatal repairs. The flow was imported, but something was dropped or fixed. */
  warnings: string[]
}

export type ParseResult = { ok: true; flow: ParsedFlow } | { ok: false; error: string }

let idSeq = 0
function uid(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Trimmed non-empty string, or null. */
function str(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function clampInt(value: unknown, min: number, max: number, fallback: number): { value: number; clamped: boolean } {
  const n = num(value)
  if (n === null) return { value: fallback, clamped: true }
  const rounded = Math.round(n)
  if (rounded < min) return { value: min, clamped: true }
  if (rounded > max) return { value: max, clamped: true }
  return { value: rounded, clamped: rounded !== n }
}

/** Counter-based warning collector: aggregated messages instead of one line per item. */
class Report {
  private counts = new Map<string, number>()

  bump(key: string, by = 1) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + by)
  }

  count(key: string): number {
    return this.counts.get(key) ?? 0
  }

  build(templates: Record<string, (n: number) => string>): string[] {
    const out: string[] = []
    for (const [key, render] of Object.entries(templates)) {
      const n = this.count(key)
      if (n > 0) out.push(render(n))
    }
    return out
  }
}

interface NodeShape {
  kind: NodeKind
  /** Valid `sourceHandle` values for edges leaving this node. Empty = no outputs. */
  sourceHandles: Set<string>
  /** `start` has no target handle, so nothing can point at it. */
  acceptsIncoming: boolean
}

function normalizeOptions(raw: unknown, report: Report): QuestionOption[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    report.bump("badArray")
    return undefined
  }
  const seen = new Set<string>()
  const out: QuestionOption[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) {
      report.bump("droppedOption")
      continue
    }
    const id = str(entry.id)
    if (id && seen.has(id)) {
      // Two handles with the same id: edges would attach ambiguously.
      report.bump("droppedOption")
      continue
    }
    const finalId = id ?? uid("opt")
    if (!id) report.bump("generatedId")
    seen.add(finalId)

    const option: QuestionOption = { id: finalId, label: str(entry.label) ?? "Opción" }
    // Date-scoped options: all four fields must be present to be meaningful.
    const hasWindow =
      entry.startMonth !== undefined ||
      entry.endMonth !== undefined ||
      entry.startDay !== undefined ||
      entry.endDay !== undefined
    if (hasWindow) {
      const sd = clampInt(entry.startDay, 1, 31, 1)
      const sm = clampInt(entry.startMonth, 1, 12, 1)
      const ed = clampInt(entry.endDay, 1, 31, 31)
      const em = clampInt(entry.endMonth, 1, 12, 12)
      if (sd.clamped || sm.clamped || ed.clamped || em.clamped) report.bump("clampedDate")
      option.startDay = sd.value
      option.startMonth = sm.value
      option.endDay = ed.value
      option.endMonth = em.value
    }
    out.push(option)
  }
  return out
}

function normalizeRules(raw: unknown, report: Report): ConditionRule[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    report.bump("badArray")
    return undefined
  }
  const out: ConditionRule[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) {
      report.bump("droppedRule")
      continue
    }
    const operator = str(entry.operator)
    const valid = operator !== null && OPERATORS.has(operator)
    if (!valid && entry.operator !== undefined) report.bump("fixedOperator")
    const id = str(entry.id)
    if (!id) report.bump("generatedId")
    out.push({
      id: id ?? uid("rl"),
      variable: typeof entry.variable === "string" ? entry.variable : "",
      operator: (valid ? operator : "equals") as ConditionRule["operator"],
      value: typeof entry.value === "string" ? entry.value : "",
    })
  }
  return out
}

function normalizeBranches(raw: unknown, report: Report): ConditionBranch[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    report.bump("badArray")
    return undefined
  }
  const seen = new Set<string>()
  const out: ConditionBranch[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) {
      report.bump("droppedBranch")
      continue
    }
    const id = str(entry.id)
    if (id && seen.has(id)) {
      report.bump("droppedBranch")
      continue
    }
    const finalId = id ?? uid("br")
    if (!id) report.bump("generatedId")
    seen.add(finalId)

    const branch: ConditionBranch = { id: finalId, label: str(entry.label) ?? "Rama" }
    if (entry.logic === "and" || entry.logic === "or") branch.logic = entry.logic
    const rules = normalizeRules(entry.rules, report)
    if (rules) branch.rules = rules

    // Legacy single-condition fields are still evaluated by the simulator, so keep them.
    if (entry.variable !== undefined || entry.operator !== undefined || entry.value !== undefined) {
      const operator = str(entry.operator)
      const valid = operator !== null && OPERATORS.has(operator)
      if (!valid && entry.operator !== undefined) report.bump("fixedOperator")
      branch.variable = typeof entry.variable === "string" ? entry.variable : ""
      branch.operator = (valid ? operator : "equals") as ConditionBranch["operator"]
      branch.value = typeof entry.value === "string" ? entry.value : ""
    }
    out.push(branch)
  }
  return out
}

function normalizeDateBranches(raw: unknown, report: Report): DateBranch[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    report.bump("badArray")
    return undefined
  }
  const seen = new Set<string>()
  const out: DateBranch[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) {
      report.bump("droppedBranch")
      continue
    }
    const id = str(entry.id)
    if (id && seen.has(id)) {
      report.bump("droppedBranch")
      continue
    }
    const finalId = id ?? uid("db")
    if (!id) report.bump("generatedId")
    seen.add(finalId)

    const sd = clampInt(entry.startDay, 1, 31, 1)
    const sm = clampInt(entry.startMonth, 1, 12, 1)
    const ed = clampInt(entry.endDay, 1, 31, 31)
    const em = clampInt(entry.endMonth, 1, 12, 12)
    if (sd.clamped || sm.clamped || ed.clamped || em.clamped) report.bump("clampedDate")

    out.push({
      id: finalId,
      label: str(entry.label) ?? "Rango",
      startDay: sd.value,
      startMonth: sm.value,
      endDay: ed.value,
      endMonth: em.value,
    })
  }
  return out
}

/** Transient React Flow state that must never be persisted from a file. */
const TRANSIENT_NODE_KEYS = ["selected", "dragging", "resizing", "measured", "internals", "parentId", "expandParent"]

function normalizeNode(raw: unknown, index: number, report: Report): { node: BotNode; shape: NodeShape } | null {
  if (!isRecord(raw)) {
    report.bump("droppedNode")
    return null
  }
  const id = str(raw.id)
  if (!id) {
    report.bump("droppedNode")
    return null
  }
  if (!isRecord(raw.data)) {
    report.bump("droppedNode")
    return null
  }
  const kindRaw = str(raw.data.kind)
  if (!kindRaw || !(kindRaw in KIND_SET)) {
    // An unknown kind crashes the renderer (NODE_VISUALS[kind] is undefined).
    report.bump("droppedNode")
    return null
  }
  const kind = kindRaw as NodeKind

  const position = isRecord(raw.position) ? raw.position : null
  const x = position ? num(position.x) : null
  const y = position ? num(position.y) : null
  let finalPosition: { x: number; y: number }
  if (x === null || y === null) {
    // Lay repaired nodes out on a grid instead of stacking them all on the origin.
    finalPosition = { x: (index % 5) * 320, y: Math.floor(index / 5) * 220 }
    report.bump("repairedPosition")
  } else {
    finalPosition = { x, y }
  }

  const data: BotNodeData = { ...(raw.data as Record<string, unknown>), kind, label: str(raw.data.label) ?? FALLBACK_LABEL[kind] }

  const options = normalizeOptions(raw.data.options, report)
  if (options) data.options = options
  else delete data.options
  const branches = normalizeBranches(raw.data.branches, report)
  if (branches) data.branches = branches
  else delete data.branches
  const dateBranches = normalizeDateBranches(raw.data.dateBranches, report)
  if (dateBranches) data.dateBranches = dateBranches
  else delete data.dateBranches

  for (const key of ["text", "variable", "placeholder", "actionName", "actionDetail"]) {
    if (data[key] !== undefined && typeof data[key] !== "string") delete data[key]
  }

  const node = { id, type: "bot", position: finalPosition, data } as BotNode
  const width = num(raw.width)
  const height = num(raw.height)
  if (width !== null) (node as Record<string, unknown>).width = width
  if (height !== null) (node as Record<string, unknown>).height = height
  for (const key of TRANSIENT_NODE_KEYS) delete (node as Record<string, unknown>)[key]

  // Handle ids must mirror what bot-node.tsx renders, or edges silently disappear.
  const sourceHandles = new Set<string>()
  if (MULTI_OUT_KINDS.has(kind)) {
    const list = kind === "question" ? options : kind === "date_condition" ? dateBranches : branches
    for (const item of list ?? []) sourceHandles.add(item.id)
  } else if (SINGLE_OUT_KINDS.has(kind)) {
    sourceHandles.add("out")
  }

  return { node, shape: { kind, sourceHandles, acceptsIncoming: kind !== "start" } }
}

function normalizeEdges(raw: unknown[], shapes: Map<string, NodeShape>, report: Report): BotEdge[] {
  const seenIds = new Set<string>()
  const out: BotEdge[] = []

  for (const entry of raw) {
    if (!isRecord(entry)) {
      report.bump("droppedEdge")
      continue
    }
    const source = str(entry.source)
    const target = str(entry.target)
    if (!source || !target) {
      report.bump("droppedEdge")
      continue
    }
    const sourceShape = shapes.get(source)
    const targetShape = shapes.get(target)
    if (!sourceShape || !targetShape) {
      // Dangling edge: one of its endpoints did not survive (or never existed).
      report.bump("droppedDanglingEdge")
      continue
    }
    if (!targetShape.acceptsIncoming) {
      report.bump("droppedDanglingEdge")
      continue
    }

    const rawHandle = entry.sourceHandle
    let sourceHandle: string | null
    if (sourceShape.sourceHandles.size === 0) {
      // "end" has no outputs at all.
      report.bump("droppedBadHandleEdge")
      continue
    }
    if (rawHandle === null || rawHandle === undefined) {
      if (sourceShape.sourceHandles.size === 1) {
        sourceHandle = [...sourceShape.sourceHandles][0]
      } else {
        // A branch node with an unspecified branch: the simulator would dead-end here.
        report.bump("droppedBadHandleEdge")
        continue
      }
    } else {
      const handle = str(rawHandle)
      if (!handle || !sourceShape.sourceHandles.has(handle)) {
        report.bump("droppedBadHandleEdge")
        continue
      }
      sourceHandle = handle
    }

    let id = str(entry.id) ?? `e-${source}-${sourceHandle}-${target}`
    if (seenIds.has(id)) {
      id = uid("e")
      report.bump("generatedId")
    }
    seenIds.add(id)

    // Every target handle in this app is anonymous; a stray id makes the edge invisible.
    if (str(entry.targetHandle)) report.bump("clearedTargetHandle")

    const edge = { id, source, target, sourceHandle, targetHandle: null, animated: false } as BotEdge
    if (str(entry.label)) (edge as Record<string, unknown>).label = str(entry.label)
    out.push(edge)
  }

  return out
}

function normalizeName(raw: unknown, fallback: string): string {
  const candidate = str(raw) ?? str(fallback) ?? "Flujo importado"
  return candidate.slice(0, MAX_NAME_LENGTH)
}

/**
 * Validate and repair an exported flow file.
 *
 * Accepts `{ name?, nodes, edges? }`. Invalid nodes and unroutable edges are dropped
 * rather than written to the database, and every repair is reported back so the user
 * finds out what was lost instead of silently importing a half-broken flow.
 */
export function parseFlowFile(rawJson: string, fallbackName = "Flujo importado"): ParseResult {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    return { ok: false, error: "El archivo está vacío." }
  }
  // Byte length, not string length: multi-byte labels are common in Spanish flows.
  const bytes = typeof Buffer !== "undefined" ? Buffer.byteLength(rawJson, "utf8") : rawJson.length
  if (bytes > MAX_FLOW_FILE_BYTES) {
    return { ok: false, error: `El archivo es demasiado grande (máximo ${Math.floor(MAX_FLOW_FILE_BYTES / 1000)} KB).` }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawJson)
  } catch {
    return { ok: false, error: "El archivo no es JSON válido." }
  }

  if (!isRecord(payload)) {
    return { ok: false, error: "El archivo no tiene el formato de Botflow: se esperaba un objeto con \"nodes\"." }
  }
  if (!Array.isArray(payload.nodes)) {
    return { ok: false, error: "El archivo no tiene el formato de Botflow: falta la lista \"nodes\"." }
  }
  if (payload.edges !== undefined && payload.edges !== null && !Array.isArray(payload.edges)) {
    return { ok: false, error: "El campo \"edges\" debe ser una lista." }
  }
  if (payload.nodes.length > MAX_NODES) {
    return { ok: false, error: `El flujo tiene demasiados nodos (máximo ${MAX_NODES}).` }
  }
  const rawEdges = (payload.edges ?? []) as unknown[]
  if (rawEdges.length > MAX_EDGES) {
    return { ok: false, error: `El flujo tiene demasiadas conexiones (máximo ${MAX_EDGES}).` }
  }

  const report = new Report()
  const shapes = new Map<string, NodeShape>()
  const nodes: BotNode[] = []

  payload.nodes.forEach((raw, index) => {
    const parsed = normalizeNode(raw, index, report)
    if (!parsed) return
    if (shapes.has(parsed.node.id)) {
      // Duplicate ids break selection, edge routing and deletion.
      report.bump("droppedDuplicateNode")
      return
    }
    shapes.set(parsed.node.id, parsed.shape)
    nodes.push(parsed.node)
  })

  if (nodes.length === 0) {
    return { ok: false, error: "El archivo no contiene ningún nodo válido de Botflow." }
  }

  const edges = normalizeEdges(rawEdges, shapes, report)

  const starts = nodes.filter((n) => n.data.kind === "start").length
  const warnings = report.build({
    droppedNode: (n) => `Se descartaron ${n} nodo(s) con formato inválido.`,
    droppedDuplicateNode: (n) => `Se descartaron ${n} nodo(s) con id repetido.`,
    repairedPosition: (n) => `${n} nodo(s) no tenían posición válida y se reacomodaron en el lienzo.`,
    droppedOption: (n) => `Se descartaron ${n} opción(es) inválidas o con id repetido.`,
    droppedBranch: (n) => `Se descartaron ${n} rama(s) inválidas o con id repetido.`,
    droppedRule: (n) => `Se descartaron ${n} condición(es) con formato inválido.`,
    droppedEdge: (n) => `Se descartaron ${n} conexión(es) sin origen o destino.`,
    droppedDanglingEdge: (n) => `Se descartaron ${n} conexión(es) que apuntaban a un nodo inexistente.`,
    droppedBadHandleEdge: (n) => `Se descartaron ${n} conexión(es) cuya salida ya no existe en el nodo de origen.`,
    clearedTargetHandle: (n) => `Se normalizó el punto de entrada de ${n} conexión(es).`,
    clampedDate: (n) => `Se ajustaron ${n} rango(s) de fecha fuera de los límites válidos.`,
    fixedOperator: (n) => `Se corrigieron ${n} operador(es) de condición desconocidos.`,
    generatedId: (n) => `Se generaron ${n} identificador(es) faltante(s).`,
    badArray: (n) => `Se ignoraron ${n} campo(s) que debían ser listas.`,
  })

  if (starts === 0) warnings.push("El flujo no tiene nodo de Inicio: la simulación arrancará desde el primer nodo.")
  if (starts > 1) warnings.push(`El flujo tiene ${starts} nodos de Inicio: la simulación usará el primero.`)

  return {
    ok: true,
    flow: { name: normalizeName(payload.name, fallbackName), nodes, edges, warnings },
  }
}

/**
 * Cheap structural guard for data coming from the editor itself (autosave / manual save).
 * Unlike `parseFlowFile` this never rewrites anything — it only refuses payloads that
 * would corrupt the row, so a legitimate save can't silently lose user data.
 */
export function isPersistableFlow(nodes: unknown, edges: unknown): boolean {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) return false
  for (const node of nodes) {
    if (!isRecord(node)) return false
    if (!str(node.id)) return false
    if (!isRecord(node.position) || num(node.position.x) === null || num(node.position.y) === null) return false
    if (!isRecord(node.data)) return false
    const kind = str(node.data.kind)
    if (!kind || !(kind in KIND_SET)) return false
  }
  for (const edge of edges) {
    if (!isRecord(edge)) return false
    if (!str(edge.source) || !str(edge.target)) return false
  }
  return true
}
