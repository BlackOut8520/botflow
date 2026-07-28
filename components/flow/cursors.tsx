"use client"

import { useOthers } from "@liveblocks/react/suspense"
import { useStore } from "@xyflow/react"
import { MousePointer2 } from "lucide-react"

const COLORS = ["#DC2626", "#D97706", "#059669", "#7C3AED", "#DB2777", "#2563EB", "#16A34A"]

export function Cursors() {
  const others = useOthers()
  const transform = useStore((s) => s.transform) // [x, y, zoom]

  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        if (!presence || !presence.cursor) {
          return null
        }

        return (
          <Cursor
            key={connectionId}
            x={presence.cursor.x * transform[2] + transform[0]}
            y={presence.cursor.y * transform[2] + transform[1]}
            color={info?.color ?? COLORS[connectionId % COLORS.length]}
            name={info?.name ?? `Usuario ${connectionId}`}
          />
        )
      })}
    </>
  )
}

function Cursor({ x, y, color, name }: { x: number; y: number; color: string; name: string }) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-50 transition-all duration-100 ease-out"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      <MousePointer2
        className="size-5"
        style={{ fill: color, color: color }}
      />
      <div
        className="absolute left-5 top-5 rounded-md px-1.5 py-0.5 text-xs text-white whitespace-nowrap shadow-sm"
        style={{ backgroundColor: color }}
      >
        {name}
      </div>
    </div>
  )
}
