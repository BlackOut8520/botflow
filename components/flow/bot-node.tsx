"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { BotNode as BotNodeType } from "@/lib/flow-types"
import { NODE_KINDS } from "@/lib/flow-types"
import { NODE_VISUALS, NODE_VAR } from "@/lib/node-visuals"
import { useSimulation } from "./simulation-context"
import { cn } from "@/lib/utils"

const handleStyle = (color: string): React.CSSProperties => ({
  width: 10,
  height: 10,
  background: "var(--card)",
  border: `2px solid ${color}`,
})

function BotNodeComponent({ id, data, selected }: NodeProps<BotNodeType>) {
  const { activeNodeId, visitedNodeIds } = useSimulation()
  const visual = NODE_VISUALS[data.kind]
  const meta = NODE_KINDS[data.kind]
  const Icon = visual.icon
  const color = NODE_VAR[data.kind]

  const isActive = activeNodeId === id
  const isVisited = visitedNodeIds.has(id) && !isActive

  // determine outgoing handles
  const isMulti = data.kind === "question" || data.kind === "condition"
  const branches = isMulti
    ? data.kind === "question"
      ? (data.options ?? []).map((o) => ({ id: o.id, label: o.label }))
      : (data.branches ?? []).map((b) => ({ id: b.id, label: b.label }))
    : []
  const hasSingleOut = !isMulti && meta.outputs === 1
  const hasTarget = data.kind !== "start"

  return (
    <div
      className={cn(
        "relative min-w-52 max-w-64 rounded-xl border bg-card shadow-sm transition-all",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border",
        isActive && "ring-2 ring-primary shadow-lg scale-[1.03]",
        isVisited && "opacity-90",
      )}
      style={isActive ? { borderColor: color, boxShadow: `0 0 0 3px ${color}55` } : undefined}
    >
      {hasTarget && <Handle type="target" position={Position.Left} style={handleStyle(color)} />}

      <div className="flex items-center gap-2 rounded-t-xl border-b border-border/60 px-3 py-2">
        <span className={cn("flex size-6 items-center justify-center rounded-md", visual.tint)}>
          <Icon className={cn("size-3.5", visual.color)} />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{meta.title}</span>
        {isActive && (
          <span className="ml-auto flex size-2 rounded-full bg-primary">
            <span className="size-2 animate-ping rounded-full bg-primary" />
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold leading-tight text-card-foreground">{data.label}</p>
        {data.text && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{data.text}</p>}
        {data.kind === "input" && data.variable && (
          <p className="mt-1.5 font-mono text-[11px] text-node-input">{"→ {{"}{data.variable}{"}}"}</p>
        )}
        {data.kind === "action" && data.actionName && (
          <p className="mt-1.5 font-mono text-[11px] text-node-action">{data.actionName}</p>
        )}
      </div>

      {/* single outgoing handle (centered on the right) */}
      {hasSingleOut && <Handle id="out" type="source" position={Position.Right} style={handleStyle(color)} />}

      {/* branch handles for question / condition */}
      {branches.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 px-3 py-2">
          {branches.map((b) => (
            <div key={b.id} className="relative flex items-center justify-end rounded-md bg-muted/60 px-2 py-1">
              <span className="truncate text-[11px] font-medium text-foreground">{b.label || "—"}</span>
              <Handle
                id={b.id}
                type="source"
                position={Position.Right}
                style={{ ...handleStyle(color), right: -18 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const BotNode = memo(BotNodeComponent)
