import type { Node, Edge } from "@xyflow/react"

export type NodeKind = "start" | "message" | "question" | "input" | "condition" | "action" | "end"

export interface QuestionOption {
  id: string
  label: string
}

export interface ConditionBranch {
  id: string
  label: string
  variable: string
  operator: "equals" | "not_equals" | "contains" | "empty" | "not_empty"
  value: string
}

export interface BotNodeData {
  kind: NodeKind
  label: string
  // message / question / input prompt text
  text?: string
  // question options (each becomes an outgoing branch)
  options?: QuestionOption[]
  // input: variable to store the user's answer
  variable?: string
  placeholder?: string
  // condition branches
  branches?: ConditionBranch[]
  // action / api
  actionName?: string
  actionDetail?: string
  [key: string]: unknown
}

export type BotNode = Node<BotNodeData>
export type BotEdge = Edge

export interface NodeKindMeta {
  kind: NodeKind
  title: string
  description: string
  /** number of default outputs; -1 means dynamic (based on options/branches) */
  outputs: number
}

export const NODE_KINDS: Record<NodeKind, NodeKindMeta> = {
  start: { kind: "start", title: "Inicio", description: "Punto de entrada del flujo", outputs: 1 },
  message: { kind: "message", title: "Mensaje del bot", description: "El bot envía un texto", outputs: 1 },
  question: {
    kind: "question",
    title: "Pregunta con opciones",
    description: "El usuario elige una opción y el flujo se ramifica",
    outputs: -1,
  },
  input: {
    kind: "input",
    title: "Entrada de texto",
    description: "Captura texto libre y lo guarda en una variable",
    outputs: 1,
  },
  condition: {
    kind: "condition",
    title: "Condición / Lógica",
    description: "Ramifica según el valor de una variable",
    outputs: -1,
  },
  action: {
    kind: "action",
    title: "Acción / API",
    description: "Simula una llamada externa antes de continuar",
    outputs: 1,
  },
  end: { kind: "end", title: "Fin", description: "Cierra la conversación", outputs: 0 },
}

/** The list of kinds the user can drag/add (start is unique and pre-placed). */
export const ADDABLE_KINDS: NodeKind[] = ["message", "question", "input", "condition", "action", "end"]
