import type { BotNode, BotEdge, ConditionRule, ConditionBranch, DateBranch } from "./flow-types"

export type IssueSeverity = "critical" | "warning" | "info"
export type IssueCategory = "condition" | "connection" | "unreachable" | "variable" | "dead_end"

export interface AuditIssue {
  id: string
  severity: IssueSeverity
  category: IssueCategory
  title: string
  description: string
  suggestion: string
  nodeId: string
  nodeLabel: string
  nodeKind: string
  optionId?: string
  branchId?: string
}

export interface AuditReport {
  totalNodes: number
  totalEdges: number
  criticalCount: number
  warningCount: number
  infoCount: number
  issues: AuditIssue[]
}

export function runFlowAudit(nodes: BotNode[], edges: BotEdge[]): AuditReport {
  const nodeMap = new Map<string, BotNode>()
  nodes.forEach((n) => nodeMap.set(n.id, n))

  const outgoingEdges = new Map<string, BotEdge[]>()
  const handleEdges = new Map<string, BotEdge[]>()
  const incomingEdges = new Map<string, BotEdge[]>()

  edges.forEach((e) => {
    if (!outgoingEdges.has(e.source)) outgoingEdges.set(e.source, [])
    outgoingEdges.get(e.source)!.push(e)

    if (!incomingEdges.has(e.target)) incomingEdges.set(e.target, [])
    incomingEdges.get(e.target)!.push(e)

    if (e.sourceHandle) {
      const key = `${e.source}:${e.sourceHandle}`
      if (!handleEdges.has(key)) handleEdges.set(key, [])
      handleEdges.get(key)!.push(e)
    }
  })

  const issues: AuditIssue[] = []
  let issueCounter = 0
  const genId = () => `iss-${++issueCounter}`

  // 1. Diagnóstico de Alcance / Nodos inalcanzables desde start (o por keywords)
  const reachableNodes = new Set<string>()
  nodes.forEach((n) => {
    if (n.data?.kind === "start") reachableNodes.add(n.id)
    if (n.data?.keywords && Array.isArray(n.data.keywords) && n.data.keywords.length > 0) {
      reachableNodes.add(n.id)
    }
  })

  const queue = Array.from(reachableNodes)
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const out = outgoingEdges.get(currentId) || []
    out.forEach((e) => {
      if (nodeMap.has(e.target) && !reachableNodes.has(e.target)) {
        reachableNodes.add(e.target)
        queue.push(e.target)
      }
    })
  }

  nodes.forEach((n) => {
    if (!reachableNodes.has(n.id)) {
      issues.push({
        id: genId(),
        severity: "warning",
        category: "unreachable",
        title: "Nodo Inalcanzable (Aislado)",
        description: `El bloque «${n.data?.label || n.id}» está flotando en el lienzo y ningún camino ni palabra clave puede llegar a él.`,
        suggestion: "Conéctalo desde un nodo previo o agrégale palabras clave (keywords) de activación.",
        nodeId: n.id,
        nodeLabel: n.data?.label || n.id,
        nodeKind: n.data?.kind || "unknown",
      })
    }
  })

  // 2. Diagnóstico de Nodos Condicionales y Condición de Fecha
  nodes.forEach((n) => {
    const kind = n.data?.kind
    if (kind === "condition") {
      const branches = (n.data.branches as ConditionBranch[] | undefined) ?? []
      if (branches.length === 0) {
        issues.push({
          id: genId(),
          severity: "critical",
          category: "condition",
          title: "Condicional sin ramas",
          description: `El bloque condicional «${n.data?.label || n.id}» no tiene ninguna rama configurada.`,
          suggestion: "Añade al menos una rama de condición o rama por defecto en el panel de propiedades.",
          nodeId: n.id,
          nodeLabel: n.data?.label || n.id,
          nodeKind: kind,
        })
      } else {
        // Verificar rama por defecto
        const hasDefault = branches.some((b) => (!b.rules || b.rules.length === 0) && !b.variable)
        if (!hasDefault) {
          issues.push({
            id: genId(),
            severity: "critical",
            category: "condition",
            title: "Falta rama por defecto (Else / Fallback)",
            description: `El condicional «${n.data?.label || n.id}» no tiene una rama sin reglas. Si ninguna regla coincide, el bot se detendrá.`,
            suggestion: "Añade una rama sin condiciones al final para manejar cualquier otro caso.",
            nodeId: n.id,
            nodeLabel: n.data?.label || n.id,
            nodeKind: kind,
          })
        }

        // Verificar conexiones de las ramas
        branches.forEach((b) => {
          const key = `${n.id}:${b.id}`
          const conn = handleEdges.get(key) || []
          if (conn.length === 0) {
            issues.push({
              id: genId(),
              severity: "critical",
              category: "condition",
              title: "Rama condicional sin cable de salida",
              description: `La rama «${b.label || "Sin etiqueta"}» en el bloque «${n.data?.label || n.id}» no está conectada a ningún nodo.`,
              suggestion: "Conecta el punto de salida de esta rama al siguiente bloque del flujo.",
              nodeId: n.id,
              nodeLabel: n.data?.label || n.id,
              nodeKind: kind,
              branchId: b.id,
            })
          }
        })
      }
    } else if (kind === "date_condition") {
      const dateBranches = (n.data.dateBranches as DateBranch[] | undefined) ?? []
      if (dateBranches.length === 0) {
        issues.push({
          id: genId(),
          severity: "critical",
          category: "condition",
          title: "Condición de fecha vacía",
          description: `El bloque de fecha «${n.data?.label || n.id}» no tiene periodos definidos.`,
          suggestion: "Añade periodos de fecha (ej. Enero-Junio) en el panel de propiedades.",
          nodeId: n.id,
          nodeLabel: n.data?.label || n.id,
          nodeKind: kind,
        })
      } else {
        dateBranches.forEach((b) => {
          const key = `${n.id}:${b.id}`
          const conn = handleEdges.get(key) || []
          if (conn.length === 0) {
            issues.push({
              id: genId(),
              severity: "critical",
              category: "condition",
              title: "Periodo de fecha sin cable de salida",
              description: `El periodo «${b.label || "Sin etiqueta"}» en «${n.data?.label || n.id}» no está conectado.`,
              suggestion: "Conecta el conector del periodo de fecha hacia el nodo correspondiente.",
              nodeId: n.id,
              nodeLabel: n.data?.label || n.id,
              nodeKind: kind,
              branchId: b.id,
            })
          }
        })
      }
    }
  })

  // 3. Diagnóstico de Preguntas y Opciones desconectadas
  nodes.forEach((n) => {
    if (n.data?.kind === "question" && Array.isArray(n.data.options)) {
      n.data.options.forEach((opt) => {
        if (opt.isBack) return // Las opciones con Volver son dinámicas
        const key = `${n.id}:${opt.id}`
        const conn = handleEdges.get(key) || []
        if (conn.length === 0) {
          issues.push({
            id: genId(),
            severity: "warning",
            category: "connection",
            title: "Opción de pregunta sin conectar",
            description: `La opción «${opt.label}» del bloque «${n.data?.label || n.id}» no tiene cable de salida.`,
            suggestion: "Conecta el cable de esta opción o actívale 'Acción dinámica: Volver al menú anterior'.",
            nodeId: n.id,
            nodeLabel: n.data?.label || n.id,
            nodeKind: "question",
            optionId: opt.id,
          })
        }
      })
    }
  })

  // 4. Diagnóstico de Callejones Sin Salida (Dead Ends)
  nodes.forEach((n) => {
    const kind = n.data?.kind
    if (kind === "end") return
    const out = outgoingEdges.get(n.id) || []
    if (out.length === 0) {
      if (kind === "question" && Array.isArray(n.data?.options) && n.data.options.length > 0 && n.data.options.every((o) => o.isBack)) {
        return
      }
      // Evitar duplicar advertencia si ya se reportó como opción desconectada
      if (kind !== "question" && kind !== "condition" && kind !== "date_condition") {
        issues.push({
          id: genId(),
          severity: "warning",
          category: "dead_end",
          title: "Callejón sin salida (Dead End)",
          description: `El bloque «${n.data?.label || n.id}» no se conecta a ningún nodo posterior y la conversación se detendrá.`,
          suggestion: "Conéctalo a un nodo de respuesta, siguiente paso o nodo 'Fin'.",
          nodeId: n.id,
          nodeLabel: n.data?.label || n.id,
          nodeKind: kind || "unknown",
        })
      }
    }
  })

  // 5. Diagnóstico de Sobreescritura de Variables (Uso excesivo de la variable por defecto "respuesta")
  nodes.forEach((n) => {
    if (n.data?.kind === "input" && (!n.data.variable || n.data.variable === "respuesta")) {
      issues.push({
        id: genId(),
        severity: "info",
        category: "variable",
        title: "Variable compartida / por defecto (respuesta)",
        description: `El bloque «${n.data?.label || n.id}» usa la variable por defecto 'respuesta'.`,
        suggestion: "Considera asignarle un nombre único (ej. 'nombre_tutor', 'correo_alumno') para no sobreescribir datos anteriores.",
        nodeId: n.id,
        nodeLabel: n.data?.label || n.id,
        nodeKind: "input",
      })
    }
  })

  const criticalCount = issues.filter((i) => i.severity === "critical").length
  const warningCount = issues.filter((i) => i.severity === "warning").length
  const infoCount = issues.filter((i) => i.severity === "info").length

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    criticalCount,
    warningCount,
    infoCount,
    issues,
  }
}
