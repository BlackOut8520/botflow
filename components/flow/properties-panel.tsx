"use client"

import { Trash2, Plus, X, MousePointerClick } from "lucide-react"
import type { BotNode, BotNodeData, ConditionBranch, ConditionRule, QuestionOption } from "@/lib/flow-types"
import { NODE_KINDS } from "@/lib/flow-types"
import { NODE_VISUALS } from "@/lib/node-visuals"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface PropertiesPanelProps {
  node: BotNode | null
  onChange: (id: string, patch: Partial<BotNodeData>) => void
  onDelete: (id: string) => void
}

const OPERATORS = [
  { value: "equals", label: "es igual a" },
  { value: "not_equals", label: "es distinto de" },
  { value: "contains", label: "contiene" },
  { value: "empty", label: "está vacío" },
  { value: "not_empty", label: "no está vacío" },
]

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export function PropertiesPanel({ node, onChange, onDelete }: PropertiesPanelProps) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <MousePointerClick className="size-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium text-foreground">Ningún nodo seleccionado</p>
        <p className="text-xs text-muted-foreground">Selecciona un nodo del lienzo para editar su contenido.</p>
      </div>
    )
  }

  const { kind } = node.data
  const meta = NODE_KINDS[kind]
  const visual = NODE_VISUALS[kind]
  const Icon = visual.icon

  const set = (patch: Partial<BotNodeData>) => onChange(node.id, patch)

  // question options
  const options = node.data.options ?? []
  const updateOption = (id: string, label: string) =>
    set({ options: options.map((o) => (o.id === id ? { ...o, label } : o)) })
  const addOption = () =>
    set({ options: [...options, { id: uid("opt"), label: `Opción ${options.length + 1}` }] as QuestionOption[] })
  const removeOption = (id: string) => set({ options: options.filter((o) => o.id !== id) })

  // condition branches
  const branches = node.data.branches ?? []
  const updateBranch = (id: string, patch: Partial<ConditionBranch>) =>
    set({ branches: branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  const addBranch = () =>
    set({
      branches: [
        ...branches,
        { id: uid("br"), label: `Rama ${branches.length + 1}`, logic: "and", rules: [] } as ConditionBranch,
      ],
    })
  const removeBranch = (id: string) => set({ branches: branches.filter((b) => b.id !== id) })

  // rules within a branch
  const addRule = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId)
    if (!branch) return
    const newRule: ConditionRule = { id: uid("rule"), variable: "", operator: "equals", value: "" }
    updateBranch(branchId, { rules: [...(branch.rules ?? []), newRule] })
  }
  const updateRule = (branchId: string, ruleId: string, patch: Partial<ConditionRule>) => {
    const branch = branches.find((b) => b.id === branchId)
    if (!branch) return
    updateBranch(branchId, { rules: (branch.rules ?? []).map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) })
  }
  const removeRule = (branchId: string, ruleId: string) => {
    const branch = branches.find((b) => b.id === branchId)
    if (!branch) return
    updateBranch(branchId, { rules: (branch.rules ?? []).filter((r) => r.id !== ruleId) })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className={cn("flex size-8 items-center justify-center rounded-md", visual.tint)}>
          <Icon className={cn("size-4", visual.color)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{meta.title}</p>
          <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="node-label">Etiqueta del nodo</Label>
          <Input
            id="node-label"
            value={node.data.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Nombre interno del paso"
          />
        </div>

        {(kind === "message" || kind === "question" || kind === "input") && (
          <div className="space-y-1.5">
            <Label htmlFor="node-text">
              {kind === "input" ? "Pregunta al usuario" : "Texto del bot"}
            </Label>
            <Textarea
              id="node-text"
              value={node.data.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              rows={3}
              placeholder="Escribe el mensaje. Usa {{variable}} para insertar datos."
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: usa <code className="rounded bg-muted px-1 font-mono">{"{{nombre}}"}</code> para insertar variables.
            </p>
          </div>
        )}

        {kind === "input" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="node-var">Guardar en variable</Label>
              <Input
                id="node-var"
                value={node.data.variable ?? ""}
                onChange={(e) => set({ variable: e.target.value.replace(/\s/g, "_") })}
                placeholder="nombre"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-ph">Placeholder</Label>
              <Input
                id="node-ph"
                value={node.data.placeholder ?? ""}
                onChange={(e) => set({ placeholder: e.target.value })}
                placeholder="Escribe aquí..."
              />
            </div>
          </div>
        )}

        {kind === "question" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="question-var">Guardar opción elegida en variable</Label>
              <Input
                id="question-var"
                value={node.data.variable ?? ""}
                onChange={(e) => set({ variable: e.target.value.replace(/\s/g, "_") })}
                placeholder="ej: opcion_elegida"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Opcional. El texto de la opción seleccionada se guardará en esta variable para usarla en una Condición.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Opciones</Label>
                <Button variant="ghost" size="sm" onClick={addOption} className="h-7 gap-1 px-2 text-xs">
                  <Plus className="size-3.5" /> Añadir
                </Button>
              </div>
              <div className="space-y-2">
                {options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <Input value={o.label} onChange={(e) => updateOption(o.id, e.target.value)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(o.id)}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Eliminar opción"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                {options.length === 0 && (
                  <p className="text-xs text-muted-foreground">Añade opciones para ramificar el flujo.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {kind === "condition" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Ramas condicionales</Label>
              <Button variant="ghost" size="sm" onClick={addBranch} className="h-7 gap-1 px-2 text-xs">
                <Plus className="size-3.5" /> Añadir rama
              </Button>
            </div>
            {branches.map((b) => {
              const rules = b.rules ?? []
              const isDefault = rules.length === 0 && !b.variable
              return (
                <div key={b.id} className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
                  {/* Cabecera de la rama */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={b.label}
                      onChange={(e) => updateBranch(b.id, { label: e.target.value })}
                      placeholder="Etiqueta de la rama"
                      className="h-8"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBranch(b.id)}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Eliminar rama"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  {/* Lógica AND / OR (solo si hay más de una regla o se pueden agregar) */}
                  {!isDefault && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Lógica:</span>
                      <Select
                        value={b.logic ?? "and"}
                        onValueChange={(v) => updateBranch(b.id, { logic: v as "and" | "or" })}
                      >
                        <SelectTrigger size="sm" className="h-7 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND (todas)</SelectItem>
                          <SelectItem value="or">OR (alguna)</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground">
                        {(b.logic ?? "and") === "and" ? "Todas deben cumplirse" : "Basta con una"}
                      </span>
                    </div>
                  )}

                  {/* Reglas de la rama */}
                  {rules.map((r, idx) => (
                    <div key={r.id} className="space-y-1 rounded-md border border-border/60 bg-background/50 p-2">
                      {idx > 0 && (
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {(b.logic ?? "and") === "and" ? "Y además" : "O bien"}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={r.variable}
                          onChange={(e) => updateRule(b.id, r.id, { variable: e.target.value.replace(/\s/g, "_") })}
                          placeholder="variable"
                          className="h-7 flex-1 font-mono text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRule(b.id, r.id)}
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar condición"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                      <Select
                        value={r.operator}
                        onValueChange={(v) => updateRule(b.id, r.id, { operator: v as ConditionRule["operator"] })}
                      >
                        <SelectTrigger size="sm" className="h-7 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {r.operator !== "empty" && r.operator !== "not_empty" && (
                        <Input
                          value={r.value}
                          onChange={(e) => updateRule(b.id, r.id, { value: e.target.value })}
                          placeholder="valor a comparar"
                          className="h-7 text-xs"
                        />
                      )}
                    </div>
                  ))}

                  {isDefault ? (
                    <p className="text-[11px] text-muted-foreground italic">Rama por defecto (siempre se ejecuta si no coincide ninguna anterior)</p>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addRule(b.id)}
                      className="h-7 w-full gap-1 border border-dashed border-border text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3.5" /> Añadir condición
                    </Button>
                  )}
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground">
              Las ramas se evalúan en orden. Añade una rama sin condiciones como caso por defecto.
            </p>
          </div>
        )}

        {kind === "action" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="node-action-name">Nombre de la acción</Label>
              <Input
                id="node-action-name"
                value={node.data.actionName ?? ""}
                onChange={(e) => set({ actionName: e.target.value })}
                placeholder="POST /api/tickets"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-action-detail">Descripción</Label>
              <Textarea
                id="node-action-detail"
                value={node.data.actionDetail ?? ""}
                onChange={(e) => set({ actionDetail: e.target.value })}
                rows={2}
                placeholder="Qué hace esta acción durante la simulación"
              />
            </div>
          </div>
        )}

        {kind === "start" && (
          <p className="text-xs text-muted-foreground">
            Este es el punto de entrada del flujo. La simulación comienza aquí.
          </p>
        )}
        {kind === "end" && (
          <p className="text-xs text-muted-foreground">
            Nodo terminal. Cuando la simulación llega aquí, la conversación finaliza.
          </p>
        )}
      </div>

      {kind !== "start" && (
        <>
          <Separator />
          <div className="p-4">
            <Button
              variant="outline"
              onClick={() => onDelete(node.id)}
              className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" /> Eliminar nodo
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
