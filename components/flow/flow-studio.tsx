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
  type OnSelectionChangeParams,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { BotNode, BotNodeData, NodeKind } from "@/lib/flow-types"
import { NODE_KINDS } from "@/lib/flow-types"
import { initialNodes, initialEdges } from "@/lib/initial-flow"
import { NODE_VAR } from "@/lib/node-visuals"
import { useSimulator } from "@/lib/use-simulator"
import { SimulationContext } from "./simulation-context"
import { BotNode as BotNodeComponent } from "./bot-node"
import { NodePalette } from "./node-palette"
import { PropertiesPanel } from "./properties-panel"
import { Simulator } from "./simulator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Workflow } from "lucide-react"

let idCounter = 100
const newId = () => `n${++idCounter}`

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
    case "action":
      return { kind, label, actionName: "POST /api/endpoint", actionDetail: "Describe la acción a simular." }
    default:
      return { kind, label }
  }
}

const nodeTypes = { bot: BotNodeComponent }

function StudioInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<BotNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<"blocks" | "props">("blocks")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter } = useReactFlow()

  const sim = useSimulator({ nodes, edges })

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: false }, eds)),
    [setEdges],
  )

  const updateNodeData = useCallback(
    (id: string, patch: Partial<BotNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
    },
    [setNodes],
  )

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      setSelectedId(null)
      setTab("blocks")
    },
    [setNodes, setEdges],
  )

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      const id = newId()
      const pos = position ?? {
        x: 200 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      }
      const node: BotNode = { id, type: "bot", position: pos, data: defaultData(kind) }
      setNodes((nds) => [...nds, node])
      setSelectedId(id)
      setTab("props")
    },
    [setNodes],
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

  // colorize edges of active path
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const active = sim.visitedNodeIds.has(e.source) && sim.visitedNodeIds.has(e.target)
        return {
          ...e,
          animated: active && sim.isRunning,
          style: active
            ? { stroke: "var(--primary)", strokeWidth: 2 }
            : { stroke: "var(--border)", strokeWidth: 1.5 },
        }
      }),
    [edges, sim.visitedNodeIds, sim.isRunning],
  )

  const simContextValue = useMemo(
    () => ({ activeNodeId: sim.activeNodeId, visitedNodeIds: sim.visitedNodeIds, isRunning: sim.isRunning }),
    [sim.activeNodeId, sim.visitedNodeIds, sim.isRunning],
  )

  return (
    <SimulationContext.Provider value={simContextValue}>
      <div className="flex h-screen flex-col bg-background">
        {/* top bar */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight text-foreground">FlowBot Studio</h1>
            <p className="text-xs text-muted-foreground">Diseña y simula el flujo de tu bot conversacional</p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* left sidebar: blocks / properties */}
          <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "blocks" | "props")} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-3 pt-3">
                <TabsList className="w-full">
                  <TabsTrigger value="blocks" className="flex-1">
                    Bloques
                  </TabsTrigger>
                  <TabsTrigger value="props" className="flex-1">
                    Propiedades
                  </TabsTrigger>
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

          {/* center: canvas */}
          <div ref={wrapperRef} className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
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
          </div>

          {/* right: simulator */}
          <aside className="flex w-96 shrink-0 flex-col border-l border-border">
            <Simulator
              messages={sim.messages}
              awaiting={sim.awaiting}
              isRunning={sim.isRunning}
              isTyping={sim.isTyping}
              variables={sim.variables}
              onStart={sim.start}
              onReset={sim.reset}
              onChooseOption={sim.chooseOption}
              onSubmitInput={sim.submitInput}
            />
          </aside>
        </div>
      </div>
    </SimulationContext.Provider>
  )
}

export function FlowStudio() {
  return (
    <ReactFlowProvider>
      <StudioInner />
    </ReactFlowProvider>
  )
}
