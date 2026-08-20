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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { BotNode, BotNodeData, NodeKind } from "@/lib/flow-types"
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
  pollFlows,
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

/** How often the editor asks the server whether this flow moved on. */
const POLL_INTERVAL_MS = 15_000
/** How often it checks whether a newer deploy of the app itself is live. */
const APP_VERSION_INTERVAL_MS = 60_000
/** Grace period before a stale tab reloads itself once a new deploy is detected. */
const AUTO_RELOAD_SECONDS = 15
/** How long the "pulled the newest version" notice stays up. */
const REFRESHED_NOTICE_MS = 6_000

/** Stable signature of the flow list, so polling only re-renders on real changes. */
function listSignature(list: FlowSummary[]) {
  return list.map((f) => `${f.id}:${f.name}:${f.updatedAt}`).join("|")
}

/** Changes that represent real user edits worth persisting. */
function isMeaningful(changes: NodeChange[] | EdgeChange[]) {
  return changes.some((c) => c.type !== "select" && c.type !== "dimensions")
}

interface StudioInnerProps {
  initialFlows: FlowSummary[]
  initialFlow: FlowDetail | null
}

function StudioInner({ initialFlows, initialFlow }: StudioInnerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BotNode>(initialFlow?.nodes ?? START_ONLY)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow?.edges ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<"blocks" | "props">("blocks")
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  // flow management
  const [flows, setFlows] = useState<FlowSummary[]>(initialFlows)
  const [activeFlowId, setActiveFlowId] = useState<string | null>(initialFlow?.id ?? null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [switching, setSwitching] = useState(false)
  const dirtyRef = useRef(false)

  // ---- concurrency / freshness ----
  const [sync, setSync] = useState<SyncState | null>(null)
  const [reloadIn, setReloadIn] = useState<number | null>(null)
  const newAppVersion = useAppVersion(APP_VERSION_INTERVAL_MS)
  /** The `updatedAt` this editor loaded: the optimistic-locking token sent on save. */
  const baseVersionRef = useRef<string | null>(initialFlow?.updatedAt ?? null)
  /** True while a switch/import/delete is in flight, so polling stays out of the way. */
  const busyRef = useRef(false)
  const savingRef = useRef(false)
  /** True while an unresolved divergence is on screen: no autosave, no auto-refresh. */
  const blockedRef = useRef(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter, fitView } = useReactFlow()

  const sim = useSimulator({ nodes, edges })

  /** Setting sync state also flips the guard the background loops read. */
  const setSyncState = useCallback((next: SyncState | null) => {
    blockedRef.current = next?.kind === "conflict" || next?.kind === "remote-newer" || next?.kind === "deleted"
    setSync(next)
  }, [])

  /**
   * Write the canvas to the server under optimistic locking.
   *
   * `force` skips the version check and is only reachable from the explicit
   * "Guardar la mía" action in the conflict banner.
   */
  const persist = useCallback(
    async (force = false) => {
      const id = activeFlowId
      if (!id) return
      savingRef.current = true
      setSaveStatus("saving")
      try {
        const outcome = await saveFlow(id, nodes, edges, force ? null : baseVersionRef.current)
        if (outcome.status === "ok") {
          baseVersionRef.current = outcome.updatedAt
          dirtyRef.current = false
          setSaveStatus("saved")
          setSyncState(null)
          setFlows((list) => list.map((f) => (f.id === id ? { ...f, updatedAt: outcome.updatedAt } : f)))
          return
        }
        setSaveStatus("idle")
        if (outcome.status === "conflict") setSyncState({ kind: "conflict" })
        else if (outcome.status === "missing") setSyncState({ kind: "deleted" })
        else setSyncState({ kind: "error", message: outcome.reason })
      } catch {
        setSaveStatus("idle")
        setSyncState({ kind: "error", message: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." })
      } finally {
        savingRef.current = false
      }
    },
    [activeFlowId, nodes, edges, setSyncState],
  )

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!activeFlowId || !dirtyRef.current) return
    // While a divergence is unresolved, retrying would just hammer the server.
    if (blockedRef.current) return
    setSaveStatus("saving")
    const t = setTimeout(() => void persist(), 800)
    return () => clearTimeout(t)
  }, [nodes, edges, activeFlowId, persist])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
  }, [])

  // ---- manual save (button) ----
  const handleSaveNow = useCallback(() => void persist(), [persist])

  // wrap change handlers so only genuine edits flag the flow as dirty
  const handleNodesChange = useCallback(
    (changes: NodeChange<BotNode>[]) => {
      if (isMeaningful(changes)) markDirty()
      onNodesChange(changes)
    },
    [onNodesChange, markDirty],
  )
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isMeaningful(changes)) markDirty()
      onEdgesChange(changes)
    },
    [onEdgesChange, markDirty],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      markDirty()
      setEdges((eds) => addEdge({ ...connection, animated: false }, eds))
    },
    [setEdges, markDirty],
  )

  const updateNodeData = useCallback(
    (id: string, patch: Partial<BotNodeData>) => {
      markDirty()
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
    },
    [setNodes, markDirty],
  )

  const deleteNode = useCallback(
    (id: string) => {
      markDirty()
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      setSelectedId(null)
      setTab("blocks")
    },
    [setNodes, setEdges, markDirty],
  )

    const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      markDirty()
      const id = uid("n")
      // Si no viene posición (drag & drop), calculamos el centro del lienzo visible
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
      setNodes((nds) => [...nds, node])
      setSelectedId(id)
      setTab("props")
    },
    [setNodes, markDirty, screenToFlowPosition],
  )

  const duplicateNode = useCallback(
    (id: string) => {
      markDirty()
      setNodes((nds) => {
        const sourceNode = nds.find((n) => n.id === id)
        if (!sourceNode) return nds
        const newId = uid("n")
        const pos = { x: sourceNode.position.x + 30, y: sourceNode.position.y + 30 }
        // Deep copy data and reset identifiers for internal elements like branches
        const newData = JSON.parse(JSON.stringify(sourceNode.data))
        if (newData.options) newData.options.forEach((o: any) => o.id = uid("opt"))
        if (newData.branches) {
          newData.branches.forEach((b: any) => {
            b.id = uid("br")
            if (b.rules) b.rules.forEach((r: any) => r.id = uid("rl"))
          })
        }
        if (newData.dateBranches) newData.dateBranches.forEach((db: any) => db.id = uid("db"))
        
        const newNode: BotNode = { id: newId, type: "bot", position: pos, data: newData }
        return [...nds, newNode]
      })
    },
    [setNodes, markDirty],
  )

  // ---- flow switching / management ----
  const loadFlow = useCallback(
    (flow: FlowDetail, options?: { fit?: boolean }) => {
      dirtyRef.current = false
      baseVersionRef.current = flow.updatedAt
      setActiveFlowId(flow.id)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setSelectedId(null)
      setTab("blocks")
      setSaveStatus("idle")
      sim.reset()
      // `fitView` on the <ReactFlow> element only applies to the first render, so an
      // imported or switched flow has to be framed by hand or it can land off-screen.
      if (options?.fit) window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60)
    },
    [setNodes, setEdges, sim.reset, fitView],
  )

  const handleSelectFlow = useCallback(
    async (id: string) => {
      if (id === activeFlowId) return
      busyRef.current = true
      setSwitching(true)
      try {
        const flow = await getFlow(id)
        if (flow) {
          loadFlow(flow, { fit: true })
          setSyncState(null)
        } else {
          setSyncState({ kind: "error", message: "Ese flujo ya no existe." })
        }
      } catch {
        setSyncState({ kind: "error", message: "No se pudo abrir el flujo." })
      } finally {
        busyRef.current = false
        setSwitching(false)
      }
    },
    [activeFlowId, loadFlow, setSyncState],
  )

  const handleCreateFlow = useCallback(async () => {
    busyRef.current = true
    setSwitching(true)
    try {
      const flow = await createFlow()
      setFlows((f) => [{ id: flow.id, name: flow.name, updatedAt: flow.updatedAt }, ...f])
      loadFlow(flow, { fit: true })
      setSyncState(null)
    } catch {
      setSyncState({ kind: "error", message: "No se pudo crear el flujo." })
    } finally {
      busyRef.current = false
      setSwitching(false)
    }
  }, [loadFlow, setSyncState])

  const handleRenameFlow = useCallback(
    async (name: string) => {
      const id = activeFlowId
      if (!id) return
      setFlows((f) => f.map((x) => (x.id === id ? { ...x, name } : x)))
      try {
        const updatedAt = await renameFlow(id, name)
        // A rename bumps the row, so adopt the new token or the next save conflicts.
        if (updatedAt) {
          baseVersionRef.current = updatedAt
          setFlows((f) => f.map((x) => (x.id === id ? { ...x, updatedAt } : x)))
        }
      } catch {
        setSyncState({ kind: "error", message: "No se pudo renombrar el flujo." })
      }
    },
    [activeFlowId, setSyncState],
  )

  const handleDeleteFlow = useCallback(async () => {
    if (!activeFlowId) return
    const remaining = flows.filter((f) => f.id !== activeFlowId)
    busyRef.current = true
    setSwitching(true)
    dirtyRef.current = false
    try {
      await deleteFlow(activeFlowId)
      if (remaining.length === 0) {
        // deleting the last flow: start fresh with a new empty one
        const flow = await createFlow()
        setFlows([{ id: flow.id, name: flow.name, updatedAt: flow.updatedAt }])
        loadFlow(flow, { fit: true })
      } else {
        setFlows(remaining)
        const next = await getFlow(remaining[0].id)
        if (next) loadFlow(next, { fit: true })
      }
      setSyncState(null)
    } catch {
      setSyncState({ kind: "error", message: "No se pudo eliminar el flujo." })
    } finally {
      busyRef.current = false
      setSwitching(false)
    }
  }, [activeFlowId, flows, loadFlow, setSyncState])

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
      busyRef.current = true
      setSwitching(true)
      try {
        const outcome = await importFlowFromJson(rawJson, fallbackName)
        if (!outcome.ok) {
          setSyncState({ kind: "error", message: outcome.error })
          return
        }
        setFlows((f) => [
          { id: outcome.flow.id, name: outcome.flow.name, updatedAt: outcome.flow.updatedAt },
          ...f,
        ])
        loadFlow(outcome.flow, { fit: true })
        setSyncState(outcome.warnings.length > 0 ? { kind: "import-warnings", messages: outcome.warnings } : null)
      } catch {
        setSyncState({ kind: "error", message: "No se pudo importar el flujo." })
      } finally {
        busyRef.current = false
        setSwitching(false)
      }
    },
    [loadFlow, setSyncState],
  )

  const handleImportError = useCallback(
    (message: string) => setSyncState({ kind: "error", message }),
    [setSyncState],
  )

  // ---- divergence resolution ----
  const handlePullRemote = useCallback(async () => {
    const id = activeFlowId
    if (!id) return
    busyRef.current = true
    setSwitching(true)
    try {
      const fresh = await getFlow(id)
      if (fresh) {
        loadFlow(fresh, { fit: false })
        setSyncState({ kind: "refreshed" })
      } else {
        setSyncState({ kind: "deleted" })
      }
    } catch {
      setSyncState({ kind: "error", message: "No se pudo traer la versión del servidor." })
    } finally {
      busyRef.current = false
      setSwitching(false)
    }
  }, [activeFlowId, loadFlow, setSyncState])

  const handleOverwrite = useCallback(async () => {
    setSyncState(null)
    await persist(true)
  }, [persist, setSyncState])

  const handleReloadApp = useCallback(() => window.location.reload(), [])
  const handleDismissSync = useCallback(() => setSyncState(null), [setSyncState])

  /**
   * Poll the server for changes to this flow.
   *
   * With no unsaved local edits the newer version is pulled in silently — that is the
   * periodic refresh. With unsaved edits nothing is touched and the banner asks the user
   * which version wins, because overwriting either side automatically loses work.
   */
  useEffect(() => {
    const id = activeFlowId
    if (!id) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || document.visibilityState === "hidden") return
      if (busyRef.current || savingRef.current || blockedRef.current) return
      try {
        const list = await pollFlows()
        if (cancelled) return
        setFlows((prev) => (listSignature(prev) === listSignature(list) ? prev : list))

        const remote = list.find((f) => f.id === id)
        if (!remote) {
          setSyncState({ kind: "deleted" })
          return
        }
        if (remote.updatedAt === baseVersionRef.current) return
        if (dirtyRef.current) {
          setSyncState({ kind: "remote-newer" })
          return
        }
        const fresh = await getFlow(id)
        // Bail out if the user started editing while the fetch was in flight.
        if (cancelled || !fresh || dirtyRef.current || blockedRef.current) return
        loadFlow(fresh, { fit: false })
        setSyncState({ kind: "refreshed" })
      } catch {
        // Transient failure: try again on the next tick.
      }
    }

    const timer = setInterval(tick, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [activeFlowId, loadFlow, setSyncState])

  // The "pulled the newest version" notice is informational; retire it on its own.
  useEffect(() => {
    if (sync?.kind !== "refreshed") return
    const t = setTimeout(() => setSyncState(null), REFRESHED_NOTICE_MS)
    return () => clearTimeout(t)
  }, [sync, setSyncState])

  // ---- stale deploy: count down, then reload, but never over unsaved work ----
  useEffect(() => {
    if (!newAppVersion) {
      setReloadIn(null)
      return
    }
    if (dirtyRef.current || blockedRef.current) {
      setReloadIn(null)
      return
    }
    setReloadIn(AUTO_RELOAD_SECONDS)
    const timer = setInterval(() => {
      if (dirtyRef.current || blockedRef.current) {
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

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData("application/flow-node") as NodeKind
      if (!kind) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNode(kind, position)
    },
    [screenToFlowPosition, addNode],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const node = params.nodes[0]
    if (node) {
      setSelectedId(node.id)
      setTab("props")
    }
  }, [])

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId])

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

  // colorize edges by source node kind (and highlight active/visited path)
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const active = sim.visitedNodeIds.has(e.source) && sim.visitedNodeIds.has(e.target)
        const sourceNode = nodes.find((n) => n.id === e.source)
        const sourceColor = sourceNode ? NODE_VAR[sourceNode.data.kind] : "var(--muted-foreground)"
        // sim running → animado con color primario
        if (active && sim.isRunning) {
          return { ...e, animated: true, style: { stroke: "var(--primary)", strokeWidth: 3 } }
        }
        // sim terminada → línea del path resaltada (estática)
        if (active && !sim.isRunning && sim.visitedNodeIds.size > 0) {
          return { ...e, animated: false, style: { stroke: "var(--primary)", strokeWidth: 3, opacity: 0.5 } }
        }
        // sin simulación → color del nodo origen
        return { ...e, animated: false, style: { stroke: sourceColor, strokeWidth: 2.5, opacity: 0.75 } }
      }),
    [edges, nodes, sim.visitedNodeIds, sim.isRunning],
  )

  const simContextValue = useMemo(
    () => ({
      activeNodeId: sim.activeNodeId,
      visitedNodeIds: sim.visitedNodeIds,
      isRunning: sim.isRunning,
      startFrom: sim.startFrom,
      duplicateNode,
    }),
    [sim.activeNodeId, sim.visitedNodeIds, sim.isRunning, sim.startFrom, duplicateNode],
  )

  return (
    <SimulationContext.Provider value={simContextValue}>
      <div className="flex h-screen flex-col bg-background">
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
            onSelect={handleSelectFlow}
            onCreate={handleCreateFlow}
            onRename={handleRenameFlow}
            onDelete={handleDeleteFlow}
            onSave={handleSaveNow}
            onExport={handleExportFlow}
            onImport={handleImportFlow}
            onImportError={handleImportError}
          />
        </header>

        <SyncBanner
          state={sync}
          newAppVersion={newAppVersion}
          reloadIn={reloadIn}
          onPullRemote={handlePullRemote}
          onOverwrite={handleOverwrite}
          onReloadApp={handleReloadApp}
          onDismiss={handleDismissSync}
        />

        <div className="flex min-h-0 flex-1">
          {/* left sidebar: blocks / properties */}
          {leftOpen && (
            <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "blocks" | "props")} className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-3 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="blocks" className="flex-1">Bloques</TabsTrigger>
                    <TabsTrigger value="props" className="flex-1">Propiedades</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="blocks" className="min-h-0 flex-1 overflow-y-auto p-3">
                  <NodePalette onAdd={addNode} />
                </TabsContent>
                <TabsContent value="props" className="min-h-0 flex-1 overflow-hidden p-0">
                  <PropertiesPanel node={selectedNode} onChange={updateNodeData} onDelete={deleteNode} />
                </TabsContent>
              </Tabs>
            </aside>
          )}

          {/* center: canvas */}
          <div ref={wrapperRef} className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ style: { strokeWidth: 3 } }}
            >
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

            {/* toggle left panel button */}
            <button
              onClick={() => setLeftOpen((v) => !v)}
              title={leftOpen ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}
              className="absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              {leftOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>

            {/* toggle right panel button */}
            <button
              onClick={() => setRightOpen((v) => !v)}
              title={rightOpen ? "Ocultar simulador" : "Mostrar simulador"}
              className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              {rightOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </button>
          </div>

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
                onSimulatedDayChange={sim.setSimulatedDay}
                onSimulatedMonthChange={sim.setSimulatedMonth}
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

export function FlowStudio({ initialFlows, initialFlow }: StudioInnerProps) {
  return (
    <ReactFlowProvider>
      <StudioInner initialFlows={initialFlows} initialFlow={initialFlow} />
    </ReactFlowProvider>
  )
}
