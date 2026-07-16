"use client"

import { createContext, useContext } from "react"

interface SimulationState {
  activeNodeId: string | null
  visitedNodeIds: Set<string>
  isRunning: boolean
}

export const SimulationContext = createContext<SimulationState>({
  activeNodeId: null,
  visitedNodeIds: new Set(),
  isRunning: false,
})

export function useSimulation() {
  return useContext(SimulationContext)
}
