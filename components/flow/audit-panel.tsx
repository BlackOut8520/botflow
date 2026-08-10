"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Info, Locate, AlertOctagon, HelpCircle, Filter } from "lucide-react"
import type { AuditReport, IssueCategory } from "@/lib/flow-audit"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AuditPanelProps {
  report: AuditReport
  onFocusNode: (nodeId: string) => void
}

export function AuditPanel({ report, onFocusNode }: AuditPanelProps) {
  const [activeFilter, setActiveFilter] = useState<IssueCategory | "all">("all")

  const filteredIssues = report.issues.filter((issue) => {
    if (activeFilter === "all") return true
    return issue.category === activeFilter
  })

  const healthScore = Math.max(0, 100 - report.criticalCount * 10 - report.warningCount * 3)

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden text-foreground">
      {/* Header Banner */}
      <div className="p-3.5 border-b border-border bg-muted/20 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertOctagon className="size-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground">Salud del Diagrama</span>
          </div>
          <span
            className={cn(
              "text-xs font-extrabold px-2 py-0.5 rounded-full border",
              healthScore > 80
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                : healthScore > 50
                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                : "bg-destructive/10 text-destructive border-destructive/30"
            )}
          >
            {healthScore} / 100
          </span>
        </div>

        {/* Counter Badges */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <div className="flex flex-col items-center rounded-md border border-destructive/20 bg-destructive/10 p-1.5 text-center">
            <span className="text-[9px] font-bold uppercase text-destructive">Críticos</span>
            <span className="text-xs font-extrabold text-destructive">{report.criticalCount}</span>
          </div>
          <div className="flex flex-col items-center rounded-md border border-amber-500/20 bg-amber-500/10 p-1.5 text-center">
            <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">Alertas</span>
            <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">{report.warningCount}</span>
          </div>
          <div className="flex flex-col items-center rounded-md border border-blue-500/20 bg-blue-500/10 p-1.5 text-center">
            <span className="text-[9px] font-bold uppercase text-blue-600 dark:text-blue-400">Consejos</span>
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">{report.infoCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/10 overflow-x-auto">
        <Filter className="size-3 text-muted-foreground ml-1 shrink-0" />
        {[
          { id: "all", label: `Todos (${report.issues.length})` },
          { id: "condition", label: "Condición" },
          { id: "connection", label: "Cables" },
          { id: "dead_end", label: "Sin Salida" },
          { id: "unreachable", label: "Aislados" },
          { id: "variable", label: "Vars" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFilter(tab.id as any)}
            className={cn(
              "h-6 px-2 text-[10px] font-medium rounded-full shrink-0 transition-colors cursor-pointer",
              activeFilter === tab.id
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Issues Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <CheckCircle2 className="size-10 text-emerald-500 mb-2" />
            <p className="text-xs font-semibold text-foreground">¡Sin problemas detectados!</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              No hay observaciones en esta categoría.
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className="group relative flex flex-col gap-2 p-2.5 rounded-lg border border-border bg-background hover:border-primary/50 transition-all shadow-xs"
            >
              <div className="flex items-center justify-between gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] font-bold uppercase px-1.5 py-0",
                    issue.severity === "critical"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : issue.severity === "warning"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  )}
                >
                  {issue.severity === "critical" ? "Crítico" : issue.severity === "warning" ? "Alerta" : "Consejo"}
                </Badge>

                <span className="text-[11px] font-semibold text-foreground truncate max-w-[170px]" title={issue.nodeLabel}>
                  {issue.nodeLabel}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground leading-snug">{issue.description}</p>
              
              <div className="flex items-center justify-between pt-1 gap-2 border-t border-border/40 mt-0.5">
                <span className="text-[10px] text-primary font-medium truncate flex items-center gap-1" title={issue.suggestion}>
                  <HelpCircle className="size-3 shrink-0" /> {issue.suggestion}
                </span>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onFocusNode(issue.nodeId)}
                  className="h-6 gap-1 px-2 text-[10px] shrink-0 hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                  title="Enfocar nodo en el lienzo"
                >
                  <Locate className="size-3" /> Ubicar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
