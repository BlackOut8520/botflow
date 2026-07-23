"use client"

import { createContext, useContext } from "react"

interface SimulationState {
  activeNodeId: string | null
  visitedNodeIds: Set<string>
  isRunning: boolean
  startFrom: (nodeId: string) => void
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
