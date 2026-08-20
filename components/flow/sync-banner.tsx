"use client"

import { AlertTriangle, RefreshCw, RotateCcw, Save, Trash2, X, CloudCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export type SyncState =
  /** A save was refused because the row moved on: nothing was written. */
  | { kind: "conflict" }
  /** The server has a newer version and there are unsaved local edits. */
  | { kind: "remote-newer" }
  /** The flow was deleted somewhere else. */
  | { kind: "deleted" }
  /** A newer version was pulled in automatically (informational). */
  | { kind: "refreshed" }
  /** An import succeeded but the file had to be repaired. */
  | { kind: "import-warnings"; messages: string[] }
  /** The import or a save failed outright. */
  | { kind: "error"; message: string }

interface SyncBannerProps {
  state: SyncState | null
  /** True once a newer deploy of the app itself is live. */
  newAppVersion: boolean
  /** Seconds left before the page reloads itself, or null when no reload is pending. */
  reloadIn: number | null
  onPullRemote: () => void
  onOverwrite: () => void
  onReloadApp: () => void
  onDismiss: () => void
}

const TONE = {
  warn: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-primary/40 bg-primary/10 text-foreground",
}

export function SyncBanner({
  state,
  newAppVersion,
  reloadIn,
  onPullRemote,
  onOverwrite,
  onReloadApp,
  onDismiss,
}: SyncBannerProps) {
  if (!newAppVersion && !state) return null

  return (
    <div className="flex flex-col gap-px">
      {newAppVersion && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.info}`}>
          <RefreshCw className="size-4 shrink-0" />
          <span className="font-medium">Hay una versión nueva de la aplicación.</span>
          <span className="text-muted-foreground">
            {reloadIn !== null
              ? `Esta pestaña se recargará en ${reloadIn}s.`
              : "Guarda tus cambios y recarga para no trabajar sobre una versión antigua."}
          </span>
          <Button size="sm" variant="default" className="ml-auto h-7" onClick={onReloadApp}>
            Recargar ahora
          </Button>
        </div>
      )}

      {state?.kind === "conflict" && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.warn}`}>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">Otra persona guardó este flujo después de que tú lo abriste.</span>
          <span className="text-muted-foreground">Tus cambios NO se guardaron. Elige qué versión conservar.</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onPullRemote}>
              <RotateCcw className="size-3.5" />
              Traer la del servidor
            </Button>
            <Button size="sm" variant="default" className="h-7 gap-1.5" onClick={onOverwrite}>
              <Save className="size-3.5" />
              Guardar la mía
            </Button>
          </div>
        </div>
      )}

      {state?.kind === "remote-newer" && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.warn}`}>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">Este flujo cambió en el servidor y tienes cambios sin guardar.</span>
          <span className="text-muted-foreground">
            No se actualizó automáticamente para no perder tu trabajo.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onPullRemote}>
              <RotateCcw className="size-3.5" />
              Descartar mis cambios
            </Button>
            <Button size="sm" variant="default" className="h-7 gap-1.5" onClick={onOverwrite}>
              <Save className="size-3.5" />
              Guardar la mía
            </Button>
          </div>
        </div>
      )}

      {state?.kind === "deleted" && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.warn}`}>
          <Trash2 className="size-4 shrink-0" />
          <span className="font-medium">Este flujo fue eliminado por otra persona.</span>
          <span className="text-muted-foreground">Recarga para ver la lista actualizada.</span>
          <Button size="sm" variant="default" className="ml-auto h-7" onClick={onReloadApp}>
            Recargar
          </Button>
        </div>
      )}

      {state?.kind === "refreshed" && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.info}`}>
          <CloudCheck className="size-4 shrink-0" />
          <span className="font-medium">Se cargó la versión más reciente de este flujo.</span>
          <span className="text-muted-foreground">Alguien más lo editó y no tenías cambios pendientes.</span>
          <Button size="icon" variant="ghost" className="ml-auto size-7" onClick={onDismiss} aria-label="Cerrar aviso">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {state?.kind === "import-warnings" && (
        <div className={`flex flex-wrap items-start gap-2 border-b px-5 py-2 text-sm ${TONE.warn}`}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">El flujo se importó, pero el archivo tenía problemas:</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {state.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
          <Button size="icon" variant="ghost" className="ml-auto size-7" onClick={onDismiss} aria-label="Cerrar aviso">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {state?.kind === "error" && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm ${TONE.warn}`}>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">{state.message}</span>
          <Button size="icon" variant="ghost" className="ml-auto size-7" onClick={onDismiss} aria-label="Cerrar aviso">
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
