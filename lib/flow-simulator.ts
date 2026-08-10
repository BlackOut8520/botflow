import type { BotNode, BotEdge } from "./flow-types"

export type PathStatus = "end" | "dead_end" | "loop" | "max_depth"

export interface PathStep {
  nodeId: string
  nodeLabel: string
  action?: string // Ej. "Opción: Virtual", "Condición: Else"
}

export interface FlowPath {
  id: string
  steps: PathStep[]
  status: PathStatus
}

export function extractFlowPaths(
  nodes: BotNode[],
  edges: BotEdge[],
  maxPaths = 300,
  maxDepth = 40
): { paths: FlowPath[]; hasMore: boolean } {
  const paths: FlowPath[] = []
  let hasMore = false

  const nodeMap = new Map<string, BotNode>()
  nodes.forEach((n) => nodeMap.set(n.id, n))

  const outgoingEdges = new Map<string, BotEdge[]>()
  edges.forEach((e) => {
    if (!outgoingEdges.has(e.source)) outgoingEdges.set(e.source, [])
    outgoingEdges.get(e.source)!.push(e)
  })

  // Encontrar nodos de inicio explícitos o con keywords
  const startNodes = nodes.filter(
    (n) => n.data?.kind === "start" || (n.data?.keywords && Array.isArray(n.data.keywords) && n.data.keywords.length > 0)
  )
  
  // Si no hay inicios claros, usar todos los que no tengan cables de entrada
  const incomingEdges = new Set<string>()
  edges.forEach((e) => incomingEdges.add(e.target))
  const roots = startNodes.length > 0 ? startNodes : nodes.filter((n) => !incomingEdges.has(n.id))

  function dfs(currentId: string, currentPath: PathStep[], visited: Set<string>, depth: number, incomingAction?: string) {
    if (paths.length >= maxPaths) {
      hasMore = true
      return
    }

    const node = nodeMap.get(currentId)
    if (!node) return

    const step: PathStep = {
      nodeId: currentId,
      nodeLabel: node.data?.label || currentId,
      action: incomingAction,
    }

    const newPath = [...currentPath, step]

    if (depth >= maxDepth) {
      paths.push({ id: `path-${paths.length + 1}`, steps: newPath, status: "max_depth" })
      return
    }

    if (visited.has(currentId)) {
      paths.push({ id: `path-${paths.length + 1}`, steps: newPath, status: "loop" })
      return
    }

    const outEdges = outgoingEdges.get(currentId) || []

    if (node.data?.kind === "end") {
      paths.push({ id: `path-${paths.length + 1}`, steps: newPath, status: "end" })
      return
    }

    if (outEdges.length === 0) {
      // Manejar nodos de preguntas con "Volver atrás" dinámico que no necesitan cables
      if (
        node.data?.kind === "question" &&
        Array.isArray(node.data.options) &&
        node.data.options.length > 0 &&
        node.data.options.every((o: any) => o.isBack)
      ) {
        paths.push({ id: `path-${paths.length + 1}`, steps: newPath, status: "end" })
      } else {
        paths.push({ id: `path-${paths.length + 1}`, steps: newPath, status: "dead_end" })
      }
      return
    }

    const newVisited = new Set(visited)
    newVisited.add(currentId)

    // Ordenar los cables para un recorrido consistente (basado en el orden de las opciones)
    const sortedEdges = [...outEdges].sort((a, b) => {
      // Si ambos tienen handle, intentamos preservar el orden original de las opciones/ramas
      // Para esto simplificamos asumiendo que salen en orden de creación,
      // pero para una lectura humana, con que sean procesados está bien.
      return (a.sourceHandle || "").localeCompare(b.sourceHandle || "")
    })

    for (const edge of sortedEdges) {
      if (paths.length >= maxPaths) {
        hasMore = true
        return
      }

      let actionDesc: string | undefined = undefined

      if (edge.sourceHandle) {
        if (node.data?.kind === "question" && Array.isArray(node.data.options)) {
          const opt = node.data.options.find((o: any) => o.id === edge.sourceHandle)
          if (opt) actionDesc = `Elegir: "${opt.label}"`
        } else if (node.data?.kind === "condition" && Array.isArray(node.data.branches)) {
          const branch = node.data.branches.find((b: any) => b.id === edge.sourceHandle)
          if (branch) actionDesc = `Regla: ${branch.label || "De lo contrario (Else)"}`
        } else if (node.data?.kind === "date_condition" && Array.isArray(node.data.dateBranches)) {
          const branch = node.data.dateBranches.find((b: any) => b.id === edge.sourceHandle)
          if (branch) actionDesc = `Fecha: ${branch.label}`
        }
      }

      dfs(edge.target, newPath, newVisited, depth + 1, actionDesc)
    }
  }

  for (const root of roots) {
    if (paths.length >= maxPaths) break
    dfs(root.id, [], new Set(), 0)
  }

  return { paths, hasMore }
}
