"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App Error Boundary caught:", error)
  }, [error])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
        <AlertTriangle className="size-8" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">No se pudo cargar la aplicación</h2>
      <p className="max-w-md text-sm text-muted-foreground mb-6">
        Ocurrió un error al conectar con la base de datos o el servicio colaborativo. Esto puede suceder tras un periodo de inactividad.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()} className="gap-2">
          <RefreshCw className="size-4" /> Reintentar
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recargar página
        </Button>
      </div>
    </div>
  )
}
