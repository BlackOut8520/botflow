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
  importFlow,
} from "@/app/actions/flows"
import { SimulationContext } from "./simulation-context"
import { BotNode as BotNodeComponent } from "./bot-node"
import { CustomEdge } from "./custom-edge"
import { NodePalette } from "./node-palette"
import { PropertiesPanel } from "./properties-panel"
import { Simulator } from "./simulator"
import { FlowBar, type SaveStatus } from "./flow-bar"
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

  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter } = useReactFlow()

  const sim = useSimulator({ nodes, edges })

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!activeFlowId || !dirtyRef.current) return
    setSaveStatus("saving")
    const t = setTimeout(async () => {
      await saveFlow(activeFlowId, nodes, edges)
      dirtyRef.current = false
      setSaveStatus("saved")
    }, 800)
    return () => clearTimeout(t)
  }, [nodes, edges, activeFlowId])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
  }, [])

  // ---- manual save (button) ----
  const handleSaveNow = useCallback(async () => {
    if (!activeFlowId) return
    setSaveStatus("saving")
    await saveFlow(activeFlowId, nodes, edges)
    dirtyRef.current = false
    setSaveStatus("saved")
  }, [activeFlowId, nodes, edges])

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

  // ---- flow switching / management ----
  const loadFlow = useCallback(
    (flow: FlowDetail) => {
      dirtyRef.current = false
      setActiveFlowId(flow.id)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setSelectedId(null)
      setTab("blocks")
      setSaveStatus("idle")
      sim.reset()
    },
    [setNodes, setEdges, sim],
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
    async (name: string, importedNodes: BotNode[], importedEdges: typeof edges) => {
      setSwitching(true)
      const summary = await importFlow(name, importedNodes, importedEdges)
      const flow = await getFlow(summary.id)
      setFlows((f) => [summary, ...f])
      if (flow) loadFlow(flow)
      setSwitching(false)
    },
    [loadFlow],
  )

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
    }),
    [sim.activeNodeId, sim.visitedNodeIds, sim.isRunning, sim.startFrom],
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
          />
        </header>

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
