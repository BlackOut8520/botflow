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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      {/* Área invisible más ancha para facilitar dar clic y seleccionar la línea */}
      <BaseEdge path={edgePath} style={{ strokeWidth: 20, stroke: "transparent", cursor: "pointer" }} />
      
      {/* La línea visible real */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={0} />
      
      {/* Botón de borrar que aparece solo cuando se selecciona la línea */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            <button
              className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-transform hover:scale-110 hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation()
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
