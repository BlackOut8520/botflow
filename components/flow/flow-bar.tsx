"use client"

import { useState } from "react"
import type { FlowSummary } from "@/app/actions/flows"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, Check, X, Loader2, CloudCheck, Cloud } from "lucide-react"

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
}: FlowBarProps) {
  const active = flows.find((f) => f.id === activeFlowId) ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const startEditing = () => {
    setDraft(active?.name ?? "")
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== active?.name) onRename(trimmed)
    setEditing(false)
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
            onClick={onDelete}
            aria-label="Eliminar flujo"
            disabled={!active || flows.length <= 1}
          >
            <Trash2 className="size-4" />
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
    </div>
  )
}
