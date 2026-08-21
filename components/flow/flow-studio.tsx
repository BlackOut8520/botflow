"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type OnSelectionChangeParams,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { BotNode, BotEdge, BotNodeData, NodeKind } from "@/lib/flow-types"
import { NODE_KINDS } from "@/lib/flow-types"
import { NODE_VAR } from "@/lib/node-visuals"
import { useSimulator } from "@/lib/use-simulator"
import {
  type FlowSummary,
  type FlowDetail,
  getFlow,
  createFlow,
  saveFlow,
  renameFlow,
  deleteFlow,
  importFlowFromJson,
} from "@/app/actions/flows"
import { useAppVersion } from "@/lib/use-app-version"
import { SimulationContext } from "./simulation-context"
import { BotNode as BotNodeComponent } from "./bot-node"
import { CustomEdge } from "./custom-edge"
import { NodePalette } from "./node-palette"
import { PropertiesPanel } from "./properties-panel"
import { Simulator } from "./simulator"
import { FlowBar, type SaveStatus } from "./flow-bar"
import { SyncBanner, type SyncState } from "./sync-banner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Workflow, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react"
import { useUpdateMyPresence, useStorage, useMutation } from "@liveblocks/react/suspense"
import { LiveObject } from "@liveblocks/client"
import { toStoredEdge, toStoredNode, toStoredNodeData } from "@/liveblocks.config"
import { Cursors } from "./cursors"
import { runFlowAudit } from "@/lib/flow-audit"
import { AuditDialog } from "./audit-dialog"
import { AuditPanel } from "./audit-panel"
import { extractFlowPaths } from "@/lib/flow-simulator"
import { PathsPanel } from "./paths-panel"

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultData(kind: NodeKind): BotNodeData {
  const label = NODE_KINDS[kind].title
  switch (kind) {
    case "message":
      return { kind, label, text: "Escribe aquí el mensaje del bot." }
    case "question":
      return {
        kind,
        label,
        text: "¿Qué deseas hacer?",
        options: [
          { id: uid("opt"), label: "Opción 1" },
          { id: uid("opt"), label: "Opción 2" },
        ],
      }
    case "input":
      return { kind, label, text: "¿Cuál es tu respuesta?", variable: "respuesta", placeholder: "Escribe aquí..." }
    case "condition":
      return {
        kind,
        label,
        branches: [
          { id: uid("br"), label: "Si coincide", variable: "respuesta", operator: "equals", value: "" },
          { id: uid("br"), label: "Por defecto", variable: "", operator: "equals", value: "" },
        ],
      }
    case "date_condition":
      return {
        kind,
        label,
        dateBranches: [
          { id: uid("db"), label: "Enero – Junio", startDay: 1, startMonth: 1, endDay: 30, endMonth: 6 },
          { id: uid("db"), label: "Julio – Diciembre", startDay: 1, startMonth: 7, endDay: 31, endMonth: 12 },
        ],
      }
    case "action":
      return { kind, label, actionName: "POST /api/endpoint", actionDetail: "Describe la acción a simular." }
    default:
      return { kind, label }
  }
}

const nodeTypes = { bot: BotNodeComponent }
const edgeTypes = { default: CustomEdge }

const START_ONLY: BotNode[] = [
  { id: "start", type: "bot", position: { x: 0, y: 160 }, data: { kind: "start", label: "Inicio" } },
]

/** How often the editor checks whether a newer deploy of the app itself is live. */
const APP_VERSION_INTERVAL_MS = 60_000
/** Grace period before a stale tab reloads itself once a new deploy is detected. */
const AUTO_RELOAD_SECONDS = 15

/** Changes that represent real user edits worth persisting. */
function isMeaningful(changes: NodeChange[] | EdgeChange[]) {
  return changes.some((c) => c.type !== "select" && c.type !== "dimensions")
}

interface StudioInnerProps {
  initialFlows: FlowSummary[]
  initialFlow: FlowDetail | null
  onFlowChange: (flow: FlowDetail) => void
  /**
   * Notice state and the unsaved-changes flag are owned by `FlowStudio`, above the
   * Liveblocks `<Room>`. Switching or importing a flow changes the room id, which
   * remounts this component — anything held here would be wiped before it could be
   * read, which is exactly what happened to the import warnings.
   */
  sync: SyncState | null
  onSyncChange: (next: SyncState | null) => void
  newAppVersion: boolean
  reloadIn: number | null
  dirtyRef: React.MutableRefObject<boolean>
}

function StudioInner({
  initialFlows,
  initialFlow,
  onFlowChange,
  sync,
  onSyncChange,
  newAppVersion,
  reloadIn,
  dirtyRef,
}: StudioInnerProps) {
  const liveNodes = useStorage((root) => root.nodes)
  const liveEdges = useStorage((root) => root.edges)

  const nodes = useMemo(() => {
    if (!liveNodes) return (initialFlow?.nodes ?? START_ONLY) as BotNode[]
    if (typeof (liveNodes as any).values === "function") return Array.from((liveNodes as any).values()) as BotNode[]
    if (Array.isArray(liveNodes)) return liveNodes as BotNode[]
    return Object.values(liveNodes) as BotNode[]
  }, [liveNodes, initialFlow])

  const edges = useMemo(() => {
    if (!liveEdges) return (initialFlow?.edges ?? []) as Edge[]
    if (typeof (liveEdges as any).values === "function") return Array.from((liveEdges as any).values()) as Edge[]
    if (Array.isArray(liveEdges)) return liveEdges as Edge[]
    return Object.values(liveEdges) as Edge[]
  }, [liveEdges, initialFlow])
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [tab, setTab] = useState<"blocks" | "props" | "audit" | "paths">("blocks")
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  // audit state
  const [auditOpen, setAuditOpen] = useState(false)



  // flow management
  const [flows, setFlows] = useState<FlowSummary[]>(initialFlows)
  const activeFlowId = initialFlow?.id ?? null
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [switching, setSwitching] = useState(false)
  const [pathNames, setPathNames] = useState<Record<string, string>>(initialFlow?.pathNames ?? {})

  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter } = useReactFlow()

  const sim = useSimulator({ nodes, edges })
  const updateMyPresence = useUpdateMyPresence()

  // audit report (memoized)
  const auditReport = useMemo(() => runFlowAudit(nodes as BotNode[], edges as BotEdge[]), [nodes, edges])

  // simulator report (memoized)
  const simulatorReport = useMemo(() => extractFlowPaths(nodes as BotNode[], edges as BotEdge[]), [nodes, edges])

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId)
      if (targetNode) {
        setSelectedId(nodeId)
        setTab("props")
        setCenter(targetNode.position.x + 120, targetNode.position.y + 60, { zoom: 1.2, duration: 700 })
      }
    },
    [nodes, setCenter],
  )

  /**
   * Write the canvas to the server.
   *
   * A rejected save has to surface: the autosave runs from a timer, so a failure that
   * is only thrown away leaves the user believing their work is persisted.
   */
  const persist = useCallback(async () => {
    if (!activeFlowId) return
    setSaveStatus("saving")
    try {
      const result = await saveFlow(activeFlowId, nodes, edges, pathNames)
      if (result.ok) {
        dirtyRef.current = false
        setSaveStatus("saved")
        // A save that went through invalidates a previous failure notice, but must not
        // clear the warnings from a repaired import: those are still worth reading.
        if (sync?.kind === "error") onSyncChange(null)
        return
      }
      setSaveStatus("idle")
      onSyncChange({ kind: "error", message: result.reason })
    } catch {
      setSaveStatus("idle")
      onSyncChange({ kind: "error", message: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." })
    }
  }, [activeFlowId, nodes, edges, pathNames, sync, onSyncChange])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!activeFlowId || !dirtyRef.current) return
    setSaveStatus("saving")
    const t = setTimeout(() => {
      void persist()
    }, 800)
    return () => clearTimeout(t)
  }, [nodes, edges, pathNames, activeFlowId, persist])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
  }, [])

  // ---- manual save (button) ----
  const handleSaveNow = useCallback(() => {
    void persist()
  }, [persist])

  // wrap change handlers so only genuine edits flag the flow as dirty
  const onNodesChange = useMutation(({ storage }, changes: NodeChange<BotNode>[]) => {
    if (isMeaningful(changes)) markDirty()
    const map = storage.get("nodes")
    for (const c of changes) {
      if (c.type === "position" && c.position) {
        const node = map.get(c.id)
        if (node) node.update({ position: c.position })
      } else if (c.type === "remove") {
        map.delete(c.id)
      } else if (c.type === "dimensions" && c.dimensions) {
        const node = map.get(c.id)
        if (node) node.update({ measured: c.dimensions })
      }
    }
  }, [markDirty])

  const onEdgesChange = useMutation(({ storage }, changes: EdgeChange[]) => {
    if (isMeaningful(changes)) markDirty()
    const map = storage.get("edges")
    for (const c of changes) {
      if (c.type === "remove") map.delete(c.id)
    }
  }, [markDirty])

  const handleNodesChange = onNodesChange
  const handleEdgesChange = onEdgesChange

  const onConnect = useMutation(({ storage }, connection: Connection) => {
    markDirty()
    const newEdge: BotEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
    } as BotEdge
    storage.get("edges").set(newEdge.id, new LiveObject(toStoredEdge(newEdge)))
  }, [markDirty])

  const updateNodeData = useMutation(({ storage }, id: string, patch: Partial<BotNodeData>) => {
    markDirty()
    const node = storage.get("nodes").get(id)
    if (node) {
      const currentData = node.get("data")
      node.update({ data: toStoredNodeData({ ...currentData, ...patch }) })
    }
  }, [markDirty])

  const deleteNode = useMutation(({ storage }, id: string) => {
    markDirty()
    storage.get("nodes").delete(id)
    const edgesMap = storage.get("edges")
    for (const [eId, edge] of edgesMap.entries()) {
      if (edge.get("source") === id || edge.get("target") === id) {
        edgesMap.delete(eId)
      }
    }
    setSelectedId(null)
    setTab("blocks")
  }, [markDirty])

  const addNode = useMutation(({ storage }, kind: NodeKind, position?: { x: number; y: number }) => {
    markDirty()
    const id = uid("n")
    const pos = position ?? (() => {
      const wrapper = wrapperRef.current
      const cx = wrapper ? wrapper.clientWidth / 2 : 400
      const cy = wrapper ? wrapper.clientHeight / 2 : 300
      const center = screenToFlowPosition({ x: cx, y: cy })
      return {
        x: center.x - 128 + (Math.random() - 0.5) * 80,
        y: center.y - 40 + (Math.random() - 0.5) * 80,
      }
    })()
    const node: BotNode = { id, type: "bot", position: pos, data: defaultData(kind) }
    storage.get("nodes").set(id, new LiveObject(toStoredNode(node)))
    setSelectedId(id)
    setTab("props")
  }, [markDirty, screenToFlowPosition])

  const duplicateNode = useMutation(({ storage }, id: string) => {
    try {
      markDirty()
      const targetNode = nodes.find((n) => n.id === id) ?? (() => {
        const live = storage.get("nodes")?.get(id)
        if (!live) return null
        return typeof (live as any).toObject === "function" ? (live as any).toObject() : live
      })()
      if (!targetNode) return

      const newId = uid("n")
      const pos = {
        x: (targetNode.position?.x ?? 0) + 40,
        y: (targetNode.position?.y ?? 0) + 40,
      }

      // Safely clone data stripping any Liveblocks proxies or internal circular symbols
      const cleanData = (data: any): any => {
        if (!data || typeof data !== "object") return data
        const res: any = Array.isArray(data) ? [] : {}
        for (const k of Object.keys(data)) {
          if (k.startsWith("_") || typeof data[k] === "function") continue
          const val = data[k]
          if (val && typeof val === "object") {
            const raw = typeof val.toObject === "function" ? val.toObject() : val
            res[k] = cleanData(raw)
          } else {
            res[k] = val
          }
        }
        return res
      }

      const newData = cleanData(targetNode.data ?? {})
      if (Array.isArray(newData.options)) {
        newData.options = newData.options.map((o: any) => ({ ...o, id: uid("opt") }))
      }
      if (Array.isArray(newData.branches)) {
        newData.branches = newData.branches.map((b: any) => ({
          ...b,
          id: uid("br"),
          rules: Array.isArray(b.rules) ? b.rules.map((r: any) => ({ ...r, id: uid("rl") })) : b.rules,
        }))
      }
      if (Array.isArray(newData.dateBranches)) {
        newData.dateBranches = newData.dateBranches.map((db: any) => ({ ...db, id: uid("db") }))
      }

      const newNode: BotNode = {
        id: newId,
        type: targetNode.type ?? "bot",
        position: pos,
        data: newData,
        selected: false,
      }

      const nodesMap = storage.get("nodes")
      if (nodesMap) {
        nodesMap.set(newId, new LiveObject(toStoredNode(newNode)))
      }
      setSelectedId(newId)
      setTab("props")
    } catch (err) {
      console.error("Error duplicating node:", err)
    }
  }, [markDirty, nodes])

  // ---- flow switching / management ----
  const loadFlow = useCallback(
    (flow: FlowDetail) => {
      dirtyRef.current = false
      setSelectedId(null)
      setTab("blocks")
      setSaveStatus("idle")
      sim.reset()
      onFlowChange(flow)
    },
    [onFlowChange, sim],
  )

  const handleSelectFlow = useCallback(
    async (id: string) => {
      if (id === activeFlowId) return
      setSwitching(true)
      const flow = await getFlow(id)
      if (flow) loadFlow(flow)
      setSwitching(false)
    },
    [activeFlowId, loadFlow],
  )

  const handleCreateFlow = useCallback(async () => {
    setSwitching(true)
    const summary = await createFlow()
    const flow = await getFlow(summary.id)
    setFlows((f) => [summary, ...f])
    if (flow) loadFlow(flow)
    setSwitching(false)
  }, [loadFlow])

  const handleRenameFlow = useCallback(
    async (name: string) => {
      if (!activeFlowId) return
      setFlows((f) => f.map((x) => (x.id === activeFlowId ? { ...x, name } : x)))
      await renameFlow(activeFlowId, name)
    },
    [activeFlowId],
  )

  const handleDeleteFlow = useCallback(async () => {
    if (!activeFlowId) return
    const remaining = flows.filter((f) => f.id !== activeFlowId)
    setSwitching(true)
    dirtyRef.current = false
    await deleteFlow(activeFlowId)
    if (remaining.length === 0) {
      // deleting the last flow: start fresh with a new empty one
      const summary = await createFlow()
      const flow = await getFlow(summary.id)
      setFlows([summary])
      if (flow) loadFlow(flow)
    } else {
      setFlows(remaining)
      const next = await getFlow(remaining[0].id)
      if (next) loadFlow(next)
    }
    setSwitching(false)
  }, [activeFlowId, flows, loadFlow])

  const activeFlow = useMemo(() => flows.find((f) => f.id === activeFlowId) ?? null, [flows, activeFlowId])

  const handleExportFlow = useCallback(() => {
    if (!activeFlow) return
    const payload = {
      name: activeFlow.name,
      nodes,
      edges,
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2))
    const downloadAnchor = document.createElement("a")
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `${activeFlow.name.replace(/\s+/g, "_")}_botflow.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }, [activeFlow, nodes, edges])

  const handleImportFlow = useCallback(
    async (rawJson: string, fallbackName: string) => {
      setSwitching(true)
      try {
        const outcome = await importFlowFromJson(rawJson, fallbackName)
        if (!outcome.ok) {
          onSyncChange({ kind: "error", message: outcome.error })
          return
        }
        setFlows((f) => [
          { id: outcome.flow.id, name: outcome.flow.name, updatedAt: outcome.flow.updatedAt },
          ...f,
        ])
        // Same flow switch as everywhere else: the Liveblocks room remounts on the new id.
        loadFlow(outcome.flow)
        onSyncChange(outcome.warnings.length > 0 ? { kind: "import-warnings", messages: outcome.warnings } : null)
      } catch {
        onSyncChange({ kind: "error", message: "No se pudo importar el flujo." })
      } finally {
        setSwitching(false)
      }
    },
    [loadFlow],
  )

  const handleImportError = useCallback((message: string) => onSyncChange({ kind: "error", message }), [])

  const handleReloadApp = useCallback(() => window.location.reload(), [])
  const handleDismissSync = useCallback(() => onSyncChange(null), [])

  // Last line of defence: never lose unsaved edits to a reload or a closed tab.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  const handleSimulate = useCallback(() => {
    setLeftOpen(true)
    setTab("paths")
  }, [])

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const node = params.nodes[0]
    const edge = params.edges[0]
    if (node) {
      setSelectedId(node.id)
      setSelectedEdgeId(null)
      setTab("props")
    } else if (edge) {
      setSelectedEdgeId(edge.id)
      setSelectedId(null)
    } else {
      setSelectedId(null)
      setSelectedEdgeId(null)
    }
  }, [])

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId])

  const flowNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  )

  // sync active/visited state onto nodes styling via context + pan to active node
  const activeNodeId = sim.activeNodeId
  useEffect(() => {
    if (!activeNodeId) return
    const node = nodes.find((n) => n.id === activeNodeId)
    if (node) {
      setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 600 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodeId])

  const lastCursorTimeRef = useRef(0)

  // colorize edges by source node kind (and highlight active/visited path)
  const nodeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    nodes.forEach((n) => {
      map.set(n.id, NODE_VAR[n.data.kind] ?? "var(--muted-foreground)")
    })
    return map
  }, [nodes])

  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const active = sim.visitedNodeIds.has(e.source) && sim.visitedNodeIds.has(e.target)
        const sourceColor = nodeColorMap.get(e.source) ?? "var(--muted-foreground)"
        const isSelected = e.id === selectedEdgeId
        // sim running → animado con color primario
        if (active && sim.isRunning) {
          return { ...e, selected: isSelected, animated: true, style: { stroke: "var(--primary)", strokeWidth: 3 } }
        }
        // sim terminada → línea del path resaltada (estática)
        if (active && !sim.isRunning && sim.visitedNodeIds.size > 0) {
          return { ...e, selected: isSelected, animated: false, style: { stroke: "var(--primary)", strokeWidth: 3, opacity: 0.5 } }
        }
        // sin simulación → color del nodo origen
        return { ...e, selected: isSelected, animated: false, style: { stroke: sourceColor, strokeWidth: 2.5, opacity: 0.75 } }
      }),
    [edges, nodeColorMap, sim.visitedNodeIds, sim.isRunning, selectedEdgeId],
  )

  const simContextValue = useMemo(
    () => ({
      activeNodeId: sim.activeNodeId,
      visitedNodeIds: sim.visitedNodeIds,
      isRunning: sim.isRunning,
      startFrom: sim.startFrom,
      duplicateNode,
      playPath: sim.playPath,
    }),
    [sim.activeNodeId, sim.visitedNodeIds, sim.isRunning, sim.startFrom, duplicateNode, sim.playPath],
  )

  return (
    <SimulationContext.Provider value={simContextValue}>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        {/* top bar */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-5" />
          </span>
          <div className="mr-2">
            <h1 className="text-base font-semibold leading-tight text-foreground">FlowBot Studio</h1>
            <p className="text-xs text-muted-foreground">Diseña y simula el flujo de tu bot conversacional</p>
          </div>
          <FlowBar
            flows={flows}
            activeFlowId={activeFlowId}
            saveStatus={saveStatus}
            switching={switching}
            auditIssueCount={auditReport.criticalCount + auditReport.warningCount}
            onAudit={() => {
              setLeftOpen(true)
              setTab("audit")
            }}
            onSelect={handleSelectFlow}
            onCreate={handleCreateFlow}
            onRename={handleRenameFlow}
            onDelete={handleDeleteFlow}
            onSave={handleSaveNow}
            onExport={handleExportFlow}
            onImport={handleImportFlow}
            onImportError={handleImportError}
            onSimulate={handleSimulate}
          />
        </header>

        <SyncBanner
          state={sync}
          newAppVersion={newAppVersion}
          reloadIn={reloadIn}
          onReloadApp={handleReloadApp}
          onDismiss={handleDismissSync}
        />

        <div className="flex min-h-0 flex-1">
          {/* left sidebar: blocks / properties / audit */}
          {leftOpen && (
            <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card min-h-0">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "blocks" | "props" | "audit" | "paths")} className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-3 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="blocks" className="flex-1 text-xs">Bloques</TabsTrigger>
                    <TabsTrigger value="props" className="flex-1 text-xs">Ajustes</TabsTrigger>
                    <TabsTrigger value="audit" className="flex-1 text-xs gap-1">
                      Salud
                      {(auditReport.criticalCount + auditReport.warningCount) > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white px-1">
                          {auditReport.criticalCount + auditReport.warningCount}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="paths" className="flex-1 text-xs">Caminos</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="blocks" className="min-h-0 flex-1 h-full w-full overflow-y-auto p-3 m-0 flex">
                  <NodePalette onAdd={addNode} />
                </TabsContent>
                <TabsContent value="props" className="min-h-0 flex-1 h-full w-full overflow-hidden p-0 m-0 flex flex-col">
                  <PropertiesPanel node={selectedNode} onChange={updateNodeData} onDelete={deleteNode} />
                </TabsContent>
                <TabsContent value="audit" className="min-h-0 flex-1 h-full w-full overflow-hidden p-0 m-0 flex flex-col">
                  <AuditPanel report={auditReport} onFocusNode={handleFocusNode} />
                </TabsContent>
                <TabsContent value="paths" className="min-h-0 flex-1 h-full w-full overflow-hidden p-0 m-0 flex flex-col">
                  <PathsPanel 
                    paths={simulatorReport.paths} 
                    hasMore={simulatorReport.hasMore} 
                    pathNames={pathNames}
                    onRenamePath={(pathId, newName) => {
                      setPathNames(prev => {
                        const next = { ...prev, [pathId]: newName }
                        if (!newName) delete next[pathId]
                        return next
                      })
                      markDirty()
                    }}
                  />
                </TabsContent>
              </Tabs>
            </aside>
          )}

          {/* center canvas */}
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border bg-card/50 px-3 py-1.5 backdrop-blur">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLeftOpen((o) => !o)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                  title={leftOpen ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}
                >
                  {leftOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>

                {selectedNode && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Seleccionado: <strong className="font-semibold text-foreground">{selectedNode.data.label}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setRightOpen((o) => !o)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                title={rightOpen ? "Ocultar simulador" : "Mostrar simulador"}
              >
                {rightOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </button>
            </div>

            <div
              ref={wrapperRef}
              className="relative min-h-0 flex-1"
              onPointerMoveCapture={(e) => {
                if (!wrapperRef.current) return
                const now = Date.now()
                if (now - lastCursorTimeRef.current < 40) return
                lastCursorTimeRef.current = now
                const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
                updateMyPresence({ cursor: position })
              }}
              onPointerLeave={() => updateMyPresence({ cursor: null })}
            >
              <ReactFlow
                nodes={flowNodes}
                edges={styledEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onSelectionChange={onSelectionChange}
                onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
                onPaneClick={() => {
                  setSelectedId(null)
                  setSelectedEdgeId(null)
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onlyRenderVisibleElements={true}
                fitView
                fitViewOptions={{ padding: 0.2, minZoom: 0.005 }}
                minZoom={0.005}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ style: { strokeWidth: 3 } }}
              >
                <Cursors />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} className="text-border" />
                <Controls className="!border-border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button:hover]:!bg-accent" />
                <MiniMap
                  pannable
                  zoomable
                  className="!bg-card"
                  nodeColor={(n) => NODE_VAR[(n.data as BotNodeData).kind] ?? "var(--muted)"}
                  maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
                />
              </ReactFlow>
            </div>
          </main>

          {/* right: simulator */}
          {rightOpen && (
            <aside className="flex w-96 shrink-0 flex-col border-l border-border">
              <Simulator
                messages={sim.messages}
                awaiting={sim.awaiting}
                isRunning={sim.isRunning}
                isTyping={sim.isTyping}
                variables={sim.variables}
                simulatedDay={sim.simulatedDay}
                simulatedMonth={sim.simulatedMonth}
                simulatedYear={sim.simulatedYear}
                onSimulatedDayChange={sim.setSimulatedDay}
                onSimulatedMonthChange={sim.setSimulatedMonth}
                onSimulatedYearChange={sim.setSimulatedYear}
                onStart={sim.start}
                onReset={sim.reset}
                onChooseOption={sim.chooseOption}
                onSubmitInput={sim.submitInput}
              />
            </aside>
          )}
        </div>
      </div>
    </SimulationContext.Provider>
  )
}

import { Room } from "@/app/Room"
export function FlowStudio({ initialFlows, initialFlow }: { initialFlows: FlowSummary[], initialFlow: FlowDetail | null }) {
  const [activeFlow, setActiveFlow] = useState<FlowDetail | null>(initialFlow)

  // Everything below has to outlive the room: switching or importing a flow changes the
  // `<Room>` key, so the whole editor remounts. State kept inside it would be discarded
  // before the user could read it.
  const [sync, setSync] = useState<SyncState | null>(null)
  const [reloadIn, setReloadIn] = useState<number | null>(null)
  const newAppVersion = useAppVersion(APP_VERSION_INTERVAL_MS)
  const dirtyRef = useRef(false)

  // ---- stale deploy: count down, then reload, but never over unsaved work ----
  useEffect(() => {
    if (!newAppVersion || dirtyRef.current) {
      setReloadIn(null)
      return
    }
    setReloadIn(AUTO_RELOAD_SECONDS)
    const timer = setInterval(() => {
      if (dirtyRef.current) {
        setReloadIn(null)
        clearInterval(timer)
        return
      }
      setReloadIn((value) => (value === null ? null : value - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [newAppVersion])

  useEffect(() => {
    if (reloadIn !== null && reloadIn <= 0) window.location.reload()
  }, [reloadIn])

  return (
    <ReactFlowProvider>
      <Room 
        key={activeFlow?.id ?? "default"}
        roomId={activeFlow?.id ?? "default"}
        initialNodes={activeFlow?.nodes ?? START_ONLY}
        initialEdges={activeFlow?.edges ?? []}
      >
        <StudioInner
          initialFlows={initialFlows}
          initialFlow={activeFlow}
          onFlowChange={setActiveFlow}
          sync={sync}
          onSyncChange={setSync}
          newAppVersion={newAppVersion}
          reloadIn={reloadIn}
          dirtyRef={dirtyRef}
        />
      </Room>
    </ReactFlowProvider>
  )
}

