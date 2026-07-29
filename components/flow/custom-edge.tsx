import { useState } from "react"
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath, useReactFlow } from "@xyflow/react"
import { X } from "lucide-react"

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const [hovered, setHovered] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const showDelete = Boolean(selected || hovered)

  return (
    <>
      {/* Invisible wider hit area for easy hover and click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={30}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      
      {/* Real visible line */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: showDelete ? 4 : Math.max(Number(style?.strokeWidth) || 0, 3),
          stroke: showDelete ? "var(--destructive)" : style?.stroke,
          transition: "stroke 0.15s, stroke-width 0.15s",
        }}
        interactionWidth={0}
      />
      
      {/* Delete button shown when hovered or selected */}
      {showDelete && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
            className="nodrag nopan"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              type="button"
              className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-transform hover:scale-110 hover:bg-destructive/90"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                deleteElements({ edges: [{ id }] })
              }}
              title="Eliminar conexión"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
