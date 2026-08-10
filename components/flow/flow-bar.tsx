"use client"

import { useState } from "react"
import type { FlowSummary } from "@/app/actions/flows"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2, Check, X, Loader2, CloudCheck, Cloud, Save, Download, Upload, Users, AlertOctagon, Route } from "lucide-react"
import { useOthers } from "@liveblocks/react/suspense"
import { cn } from "@/lib/utils"

export type SaveStatus = "idle" | "saving" | "saved"

function ActiveUsers() {
  const others = useOthers()
  const total = others.length + 1 // +1 for self
  
  if (total <= 1) return null;

  return (
    <div className="group relative ml-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-sm cursor-pointer hover:bg-accent transition-colors">
      <div className="flex -space-x-2">
        {others.slice(0, 3).map((other) => (
          <div
            key={other.connectionId}
            className="flex size-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: other.info?.color ?? "#D583F0" }}
          >
            {other.info?.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
        ))}
        {others.length > 3 && (
          <div className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground shadow-sm">
            +{others.length - 3}
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        {total} conectados
      </span>

      {/* Dropdown interactivo */}
      <div className="absolute right-0 top-full mt-2 hidden w-48 flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-lg group-hover:flex z-50">
        <p className="px-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
          En esta sala
        </p>
        
        {/* Tú mismo */}
        <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
          <div className="size-2 rounded-full bg-primary" />
          <span className="text-xs font-medium text-foreground">Tú</span>
        </div>

        {/* Otros usuarios */}
        {others.map((other) => (
          <div key={other.connectionId} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
            <div 
              className="size-2 rounded-full" 
              style={{ backgroundColor: other.info?.color ?? "#D583F0" }}
            />
            <span className="text-xs font-medium text-foreground truncate" title={other.info?.name ?? "Anónimo"}>
              {other.info?.name ?? "Anónimo"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface FlowBarProps {
  flows: FlowSummary[]
  activeFlowId: string | null
  saveStatus: SaveStatus
  switching: boolean
  auditIssueCount?: number
  onAudit?: () => void
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onSave: () => void
  onExport: () => void
  onImport: (name: string, nodes: any[], edges: any[]) => void
  onSimulate?: () => void
}

export function FlowBar({
  flows,
  activeFlowId,
  saveStatus,
  switching,
  auditIssueCount = 0,
  onAudit,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSave,
  onExport,
  onImport,
  onSimulate,
}: FlowBarProps) {
  const active = flows.find((f) => f.id === activeFlowId) ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const startEditing = () => {
    setDraft(active?.name ?? "")
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== active?.name) onRename(trimmed)
    setEditing(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        if (data.name && Array.isArray(data.nodes)) {
          onImport(data.name, data.nodes, data.edges ?? [])
        } else {
          alert("El archivo no tiene el formato válido de Botflow.")
        }
      } catch (err) {
        alert("Error al leer el archivo JSON.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === "Enter") commit()
              if (e.key === "Escape") setEditing(false)
            }}
            className="h-9 w-52"
            aria-label="Nombre del flujo"
          />
          <Button size="icon" variant="ghost" className="size-9" onClick={commit} aria-label="Guardar nombre">
            <Check className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-9" onClick={() => setEditing(false)} aria-label="Cancelar">
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <Select value={activeFlowId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="h-9 w-56" aria-label="Seleccionar flujo">
              <SelectValue placeholder="Selecciona un flujo">{active?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="icon" variant="ghost" className="size-9" onClick={startEditing} aria-label="Renombrar flujo" disabled={!active}>
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-9" onClick={onCreate} aria-label="Nuevo flujo">
            <Plus className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label="Eliminar flujo"
            disabled={!active}
          >
            <Trash2 className="size-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            onClick={onExport}
            disabled={!active}
            title="Exportar flujo (descargar JSON)"
            aria-label="Exportar flujo"
          >
            <Download className="size-4" />
          </Button>

          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
              id="flow-import-input"
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-9"
              onClick={() => document.getElementById("flow-import-input")?.click()}
              title="Importar flujo (cargar JSON)"
              aria-label="Importar flujo"
            >
              <Upload className="size-4" />
            </Button>
          </div>

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          {onAudit && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-amber-500/40 hover:border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
              onClick={onAudit}
              title="Abrir panel de auditoría y salud del flujo"
            >
              <span className="relative flex size-2">
                {auditIssueCount > 0 && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                )}
                <span className={cn("size-2 rounded-full", auditIssueCount > 0 ? "bg-amber-500" : "bg-emerald-500")} />
              </span>
              Auditar flujo
              {auditIssueCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white px-1">
                  {auditIssueCount}
                </span>
              )}
            </Button>
          )}

          {onSimulate && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-indigo-500/40 hover:border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
              onClick={onSimulate}
              title="Abrir simulador de caminos"
            >
              <Route className="size-4" />
              Caminos
            </Button>
          )}

          <Button
            variant="default"
            className="h-9 gap-1.5"
            onClick={onSave}
            disabled={!active || switching || saveStatus === "saving"}
          >
            <Save className="size-4" />
            Guardar
          </Button>
        </>
      )}

      <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {switching || saveStatus === "saving" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {switching ? "Cargando..." : "Guardando..."}
          </>
        ) : saveStatus === "saved" ? (
          <>
            <CloudCheck className="size-3.5 text-primary" />
            Guardado
          </>
        ) : (
          <>
            <Cloud className="size-3.5" />
            Sincronizado
          </>
        )}
      </span>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este flujo?</AlertDialogTitle>
            <AlertDialogDescription>
              {active
                ? `Se eliminará "${active.name}" de forma permanente. Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={onDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActiveUsers />
    </div>
  )
}
