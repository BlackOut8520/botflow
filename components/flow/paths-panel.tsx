import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Route, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ArrowRight, Play } from "lucide-react"
import { useState } from "react"
import { FlowPath } from "@/lib/flow-simulator"
import { useSimulation } from "./simulation-context"

interface PathsPanelProps {
  paths: FlowPath[]
  hasMore: boolean
}

export function PathsPanel({ paths, hasMore }: PathsPanelProps) {
  const { playPath } = useSimulation()
  const [filter, setFilter] = useState<"all" | "end" | "issues">("all")

  const getStatusBadge = (status: FlowPath["status"]) => {
    switch (status) {
      case "end":
        return <span title="Fin Exitoso"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></span>
      case "dead_end":
        return <span title="Callejón sin salida"><XCircle className="w-4 h-4 text-amber-500" /></span>
      case "loop":
        return <span title="Bucle"><RefreshCw className="w-4 h-4 text-blue-500" /></span>
      case "max_depth":
        return <span title="Muy largo"><AlertTriangle className="w-4 h-4 text-destructive" /></span>
    }
  }

  return (
    <div className="flex flex-1 flex-col h-full w-full bg-slate-50/30 min-h-0">
      <div className="border-b p-3 bg-card shrink-0">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Route className="w-4 h-4 text-indigo-500" />
          Simulador de Caminos
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {paths.length} {hasMore ? "o más caminos" : "caminos detectados"}.
          {hasMore && " Mostrando solo 300."}
        </p>
        <div className="mt-3 flex items-center gap-1 bg-muted p-1 rounded-md">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 text-[10px] font-medium py-1 rounded transition-colors ${filter === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"}`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("end")}
            className={`flex-1 text-[10px] font-medium py-1 rounded transition-colors ${filter === "end" ? "bg-background shadow-sm text-emerald-600" : "text-muted-foreground hover:bg-background/50"}`}
          >
            Completos
          </button>
          <button
            onClick={() => setFilter("issues")}
            className={`flex-1 text-[10px] font-medium py-1 rounded transition-colors ${filter === "issues" ? "bg-background shadow-sm text-amber-600" : "text-muted-foreground hover:bg-background/50"}`}
          >
            Incompletos
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 pb-24">
        {/* @ts-ignore */}
          <Accordion type="single" collapsible={true as any} className="w-full space-y-2">
          {paths.filter(p => filter === "all" || (filter === "end" ? p.status === "end" : p.status !== "end")).map((path, index) => (
            <AccordionItem key={path.id} value={path.id} className="border bg-card rounded-md px-3 overflow-hidden shadow-sm">
              <AccordionTrigger className="hover:no-underline py-2.5">
                <div className="flex items-center justify-between w-full pr-2 gap-2">
                  <span className="font-medium text-left flex-1 truncate text-xs">
                    <span className="text-muted-foreground font-mono mr-1">#{index + 1}</span>
                    {path.steps.length > 0 ? path.steps[0].nodeLabel : "Vacío"}
                  </span>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {path.steps.length}p
                    </span>
                    {getStatusBadge(path.status)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-4">
                <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-[7px] before:w-[2px] before:bg-border ml-1 mt-1">
                  {path.steps.map((step, i) => (
                    <div key={i} className="relative flex gap-3">
                      <div className="absolute left-[2.5px] top-1.5 w-3 h-3 rounded-full bg-background border-2 border-primary z-10" />
                      <div className="ml-6 flex-1 min-w-0">
                        {step.action && (
                          <div className="flex items-center text-[10px] font-medium text-primary mb-1 truncate">
                            <ArrowRight className="w-2.5 h-2.5 mr-1 shrink-0" />
                            <span className="truncate">{step.action}</span>
                          </div>
                        )}
                        <div className="p-2 bg-muted/30 rounded border text-xs font-medium shadow-sm break-words whitespace-pre-wrap">
                          {step.nodeLabel}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {playPath && (
                    <div className="mt-4 flex justify-end pr-2">
                      <button
                        onClick={() => playPath(path)}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md shadow-sm transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        Simular camino
                      </button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        
        {paths.filter(p => filter === "all" || (filter === "end" ? p.status === "end" : p.status !== "end")).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Route className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No hay caminos con este filtro.</p>
          </div>
        )}
        </div>
    </div>
  )
}
