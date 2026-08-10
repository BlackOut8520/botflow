"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Info, Locate, AlertOctagon, HelpCircle, Filter, X } from "lucide-react"
import type { AuditReport, AuditIssue, IssueCategory } from "@/lib/flow-audit"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface AuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: AuditReport
  onFocusNode: (nodeId: string) => void
}

export function AuditDialog({ open, onOpenChange, report, onFocusNode }: AuditDialogProps) {
  const [activeFilter, setActiveFilter] = useState<IssueCategory | "all">("all")

  if (!open) return null

  const filteredIssues = report.issues.filter((issue) => {
    if (activeFilter === "all") return true
    return issue.category === activeFilter
  })

  const healthScore = Math.max(0, 100 - report.criticalCount * 10 - report.warningCount * 3)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden text-foreground">
        {/* Header */}
        <div className="p-5 border-b border-border bg-card relative">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            title="Cerrar auditoría"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-center justify-between gap-4 pr-8">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <AlertOctagon className="size-5 text-primary" />
                Auditoría y Diagnóstico del Flujo
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Inspección automática de salud del diagrama ({report.totalNodes} nodos, {report.totalEdges} conexiones)
              </p>
            </div>

            {/* Health Score Badge */}
            <div className="flex items-center gap-3 bg-muted/40 px-3 py-1.5 rounded-lg border border-border shrink-0">
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Salud del Flujo</span>
                <span
                  className={cn(
                    "text-base font-extrabold",
                    healthScore > 80 ? "text-emerald-500" : healthScore > 50 ? "text-amber-500" : "text-destructive"
                  )}
                >
                  {healthScore} / 100
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-2 pt-3">
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1.5">
              <AlertOctagon className="size-4 text-destructive shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-destructive/80">Críticos</p>
                <p className="text-sm font-bold text-destructive">{report.criticalCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5">
              <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">Advertencias</p>
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{report.warningCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5">
              <Info className="size-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">Sugerencias</p>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{report.infoCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">Total Nodos</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{report.totalNodes}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border bg-muted/20 overflow-x-auto">
          <Filter className="size-3.5 text-muted-foreground mr-1 shrink-0" />
          {[
            { id: "all", label: `Todos (${report.issues.length})` },
            { id: "condition", label: "Condicionales" },
            { id: "connection", label: "Conexiones" },
            { id: "dead_end", label: "Sin Salida" },
            { id: "unreachable", label: "Inalcanzables" },
            { id: "variable", label: "Variables" },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeFilter === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveFilter(tab.id as any)}
              className="h-7 text-xs px-2.5 rounded-full"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Issues List Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="size-12 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-foreground">¡Sin problemas detectados en esta categoría!</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Tu diagrama cumple con las mejores prácticas de flujo.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className="group relative flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/50 transition-all shadow-sm"
              >
                <div className="space-y-1 flex-1 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold uppercase px-1.5 py-0.2",
                        issue.severity === "critical"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : issue.severity === "warning"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      )}
                    >
                      {issue.severity === "critical" ? "Crítico" : issue.severity === "warning" ? "Advertencia" : "Sugerencia"}
                    </Badge>

                    <span className="font-semibold text-xs text-foreground">{issue.title}</span>

                    <Badge variant="secondary" className="text-[10px] font-mono text-muted-foreground">
                      {issue.nodeLabel}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">{issue.description}</p>
                  <p className="text-[11px] text-primary font-medium flex items-center gap-1 pt-0.5">
                    <HelpCircle className="size-3 shrink-0" /> {issue.suggestion}
                  </p>
                </div>

                {/* Focus Button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onFocusNode(issue.nodeId)
                    onOpenChange(false)
                  }}
                  className="h-8 gap-1.5 shrink-0 text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                >
                  <Locate className="size-3.5" /> Ubicar en el lienzo
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
