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

    const generateStableId = (steps: PathStep[]) => {
      // Create a deterministic hash from the sequence of nodes and actions
      return "path-" + steps.map(s => s.nodeId + (s.action ? `:${s.action}` : "")).join("|").replace(/[^a-zA-Z0-9-]/g, "")
    }

    if (depth >= maxDepth) {
      paths.push({ id: generateStableId(newPath), steps: newPath, status: "max_depth" })
      return
    }

    if (visited.has(currentId)) {
      paths.push({ id: generateStableId(newPath), steps: newPath, status: "loop" })
      return
    }

    const outEdges = outgoingEdges.get(currentId) || []

    if (node.data?.kind === "end") {
      paths.push({ id: generateStableId(newPath), steps: newPath, status: "end" })
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
        paths.push({ id: generateStableId(newPath), steps: newPath, status: "end" })
      } else {
        paths.push({ id: generateStableId(newPath), steps: newPath, status: "dead_end" })
      }
      return
    }

    const newVisited = new Set(visited)
    newVisited.add(currentId)

    // Filtrar cables de opciones marcadas como "Volver atrás" o cables fantasma por defecto
    let validEdges = outEdges
    
    // Si el nodo es una pregunta con opciones, ignorar el cable por defecto y botones de volver atrás
    if (node.data?.kind === "question" && Array.isArray(node.data.options) && node.data.options.length > 0) {
      validEdges = outEdges.filter((edge) => {
        if (!edge.sourceHandle) return false // Ignorar cable por defecto porque en runtime se esperan opciones
        const opt = node.data.options!.find((o: any) => o.id === edge.sourceHandle)
        if (!opt || opt.isBack) return false
        return true
      })
    } else if (node.data?.kind === "condition" && Array.isArray(node.data.branches) && node.data.branches.length > 0) {
      // Ignorar cables por defecto en nodos de condición si tienen ramas
      validEdges = outEdges.filter((edge) => !!edge.sourceHandle)
    } else if (node.data?.kind === "date_condition" && Array.isArray(node.data.dateBranches) && node.data.dateBranches.length > 0) {
      validEdges = outEdges.filter((edge) => !!edge.sourceHandle)
    }

    // Ordenar los cables para un recorrido consistente
    const sortedEdges = [...validEdges].sort((a, b) => {
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
