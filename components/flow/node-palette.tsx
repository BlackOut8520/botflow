"use client"

import { ADDABLE_KINDS, NODE_KINDS, type NodeKind } from "@/lib/flow-types"
import { NODE_VISUALS } from "@/lib/node-visuals"
import { cn } from "@/lib/utils"

interface NodePaletteProps {
  onAdd: (kind: NodeKind) => void
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        Arrastra al lienzo o haz clic para añadir
      </p>
      {ADDABLE_KINDS.map((kind) => {
        const meta = NODE_KINDS[kind]
        const visual = NODE_VISUALS[kind]
        const Icon = visual.icon
        return (
          <button
            key={kind}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/flow-node", kind)
              e.dataTransfer.effectAllowed = "move"
            }}
            onClick={() => onAdd(kind)}
            className="group flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", visual.tint)}>
              <Icon className={cn("size-4", visual.color)} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-card-foreground">{meta.title}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{meta.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
