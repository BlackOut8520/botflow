import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Route, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react"
import { FlowPath } from "@/lib/flow-simulator"

interface PathsPanelProps {
  paths: FlowPath[]
  hasMore: boolean
}

export function PathsPanel({ paths, hasMore }: PathsPanelProps) {
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
    <div className="flex h-full flex-col bg-slate-50/30">
      <div className="border-b p-3 bg-card shrink-0">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Route className="w-4 h-4 text-indigo-500" />
          Simulador de Caminos
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {paths.length} {hasMore ? "o más caminos" : "caminos detectados"}.
          {hasMore && " Mostrando solo 300."}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 pb-24">
          {/* @ts-ignore */}
          <Accordion type="single" collapsible={true as any} className="w-full space-y-2">
          {paths.map((path, index) => (
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
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        
        {paths.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Route className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No se encontraron caminos.</p>
          </div>
        )}
        </div>
      </ScrollArea>
    </div>
  )
}
