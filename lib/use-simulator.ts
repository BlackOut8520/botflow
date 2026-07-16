"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { BotNode, BotEdge, ConditionBranch } from "./flow-types"

export interface ChatMessage {
  id: string
  role: "bot" | "user" | "system"
  text: string
}

export interface AwaitingState {
  type: "options" | "input"
  nodeId: string
  options?: { id: string; label: string }[]
  placeholder?: string
}

let counter = 0
const nextId = () => `m${++counter}`

function interpolate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function evalBranch(b: ConditionBranch, vars: Record<string, string>) {
  const v = (vars[b.variable] ?? "").toLowerCase()
  const target = b.value.toLowerCase()
  switch (b.operator) {
    case "equals":
      return v === target
    case "not_equals":
      return v !== target
    case "contains":
      return v.includes(target)
    case "empty":
      return v.trim() === ""
    case "not_empty":
      return v.trim() !== ""
    default:
      return false
  }
}

interface UseSimulatorArgs {
  nodes: BotNode[]
  edges: BotEdge[]
}

export function useSimulator({ nodes, edges }: UseSimulatorArgs) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [visitedNodeIds, setVisitedNodeIds] = useState<Set<string>>(new Set())
  const [isRunning, setIsRunning] = useState(false)
  const [awaiting, setAwaiting] = useState<AwaitingState | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isTyping, setIsTyping] = useState(false)

  // keep latest graph + vars in refs so scheduled callbacks stay fresh
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const varsRef = useRef<Record<string, string>>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }

  const schedule = (fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay)
    timers.current.push(t)
  }

  const getNode = (id: string) => nodesRef.current.find((n) => n.id === id)
  const getTarget = (nodeId: string, handleId?: string) => {
    const edge = edgesRef.current.find(
      (e) => e.source === nodeId && (handleId ? e.sourceHandle === handleId : true),
    )
    return edge?.target
  }

  const pushMessage = (role: ChatMessage["role"], text: string) =>
    setMessages((prev) => [...prev, { id: nextId(), role, text }])

  const visit = (id: string) => {
    setActiveNodeId(id)
    setVisitedNodeIds((prev) => new Set(prev).add(id))
  }

  // advance processes a node, then schedules the next step
  const advance = useCallback((nodeId: string | undefined) => {
    if (!nodeId) {
      setIsRunning(false)
      setActiveNodeId(null)
      return
    }
    const node = getNode(nodeId)
    if (!node) {
      setIsRunning(false)
      setActiveNodeId(null)
      return
    }

    visit(nodeId)
    const data = node.data

    switch (data.kind) {
      case "start": {
        schedule(() => advance(getTarget(nodeId)), 500)
        break
      }
      case "message": {
        setIsTyping(true)
        schedule(() => {
          setIsTyping(false)
          pushMessage("bot", interpolate(data.text ?? "", varsRef.current))
          schedule(() => advance(getTarget(nodeId)), 650)
        }, 700)
        break
      }
      case "question": {
        setIsTyping(true)
        schedule(() => {
          setIsTyping(false)
          if (data.text) pushMessage("bot", interpolate(data.text, varsRef.current))
          setAwaiting({
            type: "options",
            nodeId,
            options: (data.options ?? []).map((o) => ({ id: o.id, label: o.label })),
          })
        }, 700)
        break
      }
      case "input": {
        setIsTyping(true)
        schedule(() => {
          setIsTyping(false)
          if (data.text) pushMessage("bot", interpolate(data.text, varsRef.current))
          setAwaiting({ type: "input", nodeId, placeholder: data.placeholder })
        }, 700)
        break
      }
      case "condition": {
        pushMessage("system", `Evaluando condición «${data.label}»`)
        schedule(() => {
          const branches = data.branches ?? []
          const match = branches.find((b) => !b.variable || evalBranch(b, varsRef.current))
          if (match) {
            pushMessage("system", `Rama seleccionada: ${match.label}`)
            advance(getTarget(nodeId, match.id))
          } else {
            pushMessage("system", "Ninguna rama coincidió. Fin del recorrido.")
            setIsRunning(false)
            setActiveNodeId(null)
          }
        }, 700)
        break
      }
      case "action": {
        pushMessage("system", `Ejecutando acción: ${data.actionName || data.label}`)
        schedule(() => {
          pushMessage("system", "Acción completada correctamente")
          schedule(() => advance(getTarget(nodeId)), 500)
        }, 1000)
        break
      }
      case "end": {
        pushMessage("system", "Conversación finalizada")
        setIsRunning(false)
        setActiveNodeId(null)
        break
      }
    }
  }, [])

  const start = useCallback(() => {
    clearTimers()
    counter = 0
    varsRef.current = {}
    setVariables({})
    setMessages([])
    setVisitedNodeIds(new Set())
    setAwaiting(null)
    setIsRunning(true)
    const startNode = nodesRef.current.find((n) => n.data.kind === "start") ?? nodesRef.current[0]
    if (startNode) {
      schedule(() => advance(startNode.id), 300)
    } else {
      setIsRunning(false)
    }
  }, [advance])

  const reset = useCallback(() => {
    clearTimers()
    setIsRunning(false)
    setActiveNodeId(null)
    setVisitedNodeIds(new Set())
    setMessages([])
    setAwaiting(null)
    setVariables({})
    varsRef.current = {}
    setIsTyping(false)
  }, [])

  const chooseOption = useCallback(
    (optionId: string, label: string) => {
      if (!awaiting || awaiting.type !== "options") return
      const nodeId = awaiting.nodeId
      pushMessage("user", label)
      setAwaiting(null)
      schedule(() => advance(getTarget(nodeId, optionId)), 400)
    },
    [awaiting, advance],
  )

  const submitInput = useCallback(
    (value: string) => {
      if (!awaiting || awaiting.type !== "input") return
      const nodeId = awaiting.nodeId
      const node = getNode(nodeId)
      const varName = node?.data.variable
      pushMessage("user", value)
      if (varName) {
        const nextVars = { ...varsRef.current, [varName]: value }
        varsRef.current = nextVars
        setVariables(nextVars)
      }
      setAwaiting(null)
      schedule(() => advance(getTarget(nodeId)), 400)
    },
    [awaiting, advance],
  )

  useEffect(() => () => clearTimers(), [])

  return {
    messages,
    activeNodeId,
    visitedNodeIds,
    isRunning,
    awaiting,
    variables,
    isTyping,
    start,
    reset,
    chooseOption,
    submitInput,
  }
}
