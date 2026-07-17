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
import { Plus, Pencil, Trash2, Check, X, Loader2, CloudCheck, Cloud, Save, Download, Upload } from "lucide-react"

export type SaveStatus = "idle" | "saving" | "saved"

interface FlowBarProps {
  flows: FlowSummary[]
  activeFlowId: string | null
  saveStatus: SaveStatus
  switching: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onSave: () => void
  onExport: () => void
  onImport: (name: string, nodes: any[], edges: any[]) => void
}

export function FlowBar({
  flows,
  activeFlowId,
  saveStatus,
  switching,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSave,
  onExport,
  onImport,
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
    </div>
  )
}
