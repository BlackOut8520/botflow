import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Route, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react"
import { FlowPath } from "@/lib/flow-simulator"

interface PathSimulatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paths: FlowPath[]
  hasMore: boolean
}

export function PathSimulatorDialog({ open, onOpenChange, paths, hasMore }: PathSimulatorDialogProps) {
  const getStatusBadge = (status: FlowPath["status"]) => {
    switch (status) {
      case "end":
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Fin Exitoso
          </Badge>
        )
      case "dead_end":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
            <XCircle className="w-3 h-3 mr-1" /> Callejón sin salida
          </Badge>
        )
      case "loop":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
            <RefreshCw className="w-3 h-3 mr-1" /> Bucle
          </Badge>
        )
      case "max_depth":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" /> Muy largo
          </Badge>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Route className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Simulador de Caminos</DialogTitle>
              <DialogDescription>
                Se detectaron {paths.length} {hasMore ? "o más caminos" : "caminos posibles"} en tu flujo.
                {hasMore && " Mostrando solo los primeros 300 para no afectar el rendimiento del navegador."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6 bg-slate-50/50">
          <Accordion type="single" collapsible className="w-full space-y-3">
            {paths.map((path, index) => (
              <AccordionItem key={path.id} value={path.id} className="border bg-card rounded-lg px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center justify-between w-full pr-4 gap-4">
                    <span className="font-medium text-left flex-1 truncate">
                      <span className="text-muted-foreground font-mono text-xs mr-2">#{index + 1}</span>
                      {path.steps.length > 0 ? path.steps[0].nodeLabel : "Vacío"}
                    </span>
                    <div className="shrink-0 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground hidden sm:inline-block">
                        {path.steps.length} pasos
                      </span>
                      {getStatusBadge(path.status)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-6">
                  <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-border ml-1 mt-2">
                    {path.steps.map((step, i) => (
                      <div key={i} className="relative flex gap-4">
                        <div className="absolute left-[3px] top-1.5 w-4 h-4 rounded-full bg-background border-2 border-primary z-10" />
                        <div className="ml-8 flex-1">
                          {step.action && (
                            <div className="flex items-center text-xs font-medium text-primary mb-1.5">
                              <ArrowRight className="w-3 h-3 mr-1" />
                              {step.action}
                            </div>
                          )}
                          <div className="p-3 bg-muted/30 rounded-md border text-sm font-medium shadow-sm">
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
            <div className="text-center py-16 text-muted-foreground">
              <Route className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No se encontraron caminos válidos.</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
