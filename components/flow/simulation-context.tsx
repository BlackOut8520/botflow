"use client"

import { createContext, useContext } from "react"
import type { FlowPath } from "@/lib/flow-simulator"

interface SimulationState {
  activeNodeId: string | null
  visitedNodeIds: Set<string>
  isRunning: boolean
  startFrom: (nodeId: string) => void
  duplicateNode?: (id: string) => void
  playPath?: (path: FlowPath) => void
}

export const SimulationContext = createContext<SimulationState>({
  activeNodeId: null,
  visitedNodeIds: new Set(),
  isRunning: false,
  startFrom: () => {},
})

export function useSimulation() {
  return useContext(SimulationContext)
}
