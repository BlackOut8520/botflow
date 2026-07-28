import { Play, MessageSquare, ListChecks, TextCursorInput, GitBranch, Calendar, Zap, Flag } from "lucide-react"
import type { NodeKind } from "./flow-types"

export interface NodeVisual {
  icon: typeof Play
  /** tailwind text color class bound to a node token */
  color: string
  /** tailwind bg tint class */
  tint: string
}

export const NODE_VISUALS: Record<NodeKind, NodeVisual> = {
  start: { icon: Play, color: "text-node-start", tint: "bg-node-start/10" },
  message: { icon: MessageSquare, color: "text-node-message", tint: "bg-node-message/10" },
  question: { icon: ListChecks, color: "text-node-question", tint: "bg-node-question/10" },
  input: { icon: TextCursorInput, color: "text-node-input", tint: "bg-node-input/10" },
  condition: { icon: GitBranch, color: "text-node-condition", tint: "bg-node-condition/10" },
  date_condition: { icon: Calendar, color: "text-node-question", tint: "bg-node-question/10" },
  action: { icon: Zap, color: "text-node-action", tint: "bg-node-action/10" },
  end: { icon: Flag, color: "text-node-end", tint: "bg-node-end/10" },
}

/** raw css variable name for the node border/handle color */
export const NODE_VAR: Record<NodeKind, string> = {
  start: "var(--node-start)",
  message: "var(--node-message)",
  question: "var(--node-question)",
  input: "var(--node-input)",
  condition: "var(--node-condition)",
  date_condition: "var(--node-question)",
  action: "var(--node-action)",
  end: "var(--node-end)",
}
