"use client"

import { useEffect, useRef, useState } from "react"
import { Play, RotateCcw, Send, Bot, User, Sparkles } from "lucide-react"
import type { ChatMessage, AwaitingState } from "@/lib/use-simulator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SimulatorProps {
  messages: ChatMessage[]
  awaiting: AwaitingState | null
  isRunning: boolean
  isTyping: boolean
  variables: Record<string, string>
  simulatedDay: number
  simulatedMonth: number
  onSimulatedDayChange: (day: number) => void
  onSimulatedMonthChange: (month: number) => void
  onStart: () => void
  onReset: () => void
  onChooseOption: (id: string, label: string) => void
  onSubmitInput: (value: string) => void
}

export function Simulator({
  messages,
  awaiting,
  isRunning,
  isTyping,
  variables,
  simulatedDay,
  simulatedMonth,
  onSimulatedDayChange,
  onSimulatedMonthChange,
  onStart,
  onReset,
  onChooseOption,
  onSubmitInput,
}: SimulatorProps) {
  const [inputValue, setInputValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, isTyping, awaiting])

  const handleSubmit = () => {
    const v = inputValue.trim()
    if (!v) return
    onSubmitInput(v)
    setInputValue("")
  }

  const varEntries = Object.entries(variables)

  return (
    <div className="flex h-full flex-col bg-card">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="size-4 text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Simulación</p>
            <p className="text-xs text-muted-foreground">
              {isRunning ? "En ejecución…" : "Detenida"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
            <RotateCcw className="size-3.5" /> Reiniciar
          </Button>
          <Button size="sm" onClick={onStart} className="gap-1.5">
            <Play className="size-3.5" /> {messages.length ? "Reejecutar" : "Iniciar"}
          </Button>
        </div>
      </div>

      {/* date selector for testing */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">Simular fecha:</span>
        <input
          type="number"
          min={1} max={31}
          value={simulatedDay}
          onChange={(e) => onSimulatedDayChange(Math.min(31, Math.max(1, Number(e.target.value))))}
          className="h-7 w-12 rounded-md border border-border bg-background px-2 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-[11px] text-muted-foreground">de</span>
        <select
          value={simulatedMonth}
          onChange={(e) => onSimulatedMonthChange(Number(e.target.value))}
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {/* variables bar */}
      {varEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Variables:</span>
          {varEntries.map(([k, v]) => (
            <Badge key={k} variant="secondary" className="font-mono text-[11px]">
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}

      {/* chat */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isRunning && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="size-6 text-primary" />
            </span>
            <p className="text-sm font-medium text-foreground">Listo para simular</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Pulsa «Iniciar» para recorrer el flujo. El nodo activo se resaltará en el lienzo mientras conversas con el bot.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {isTyping && (
          <div className="flex items-end gap-2">
            <Avatar role="bot" />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}

        {/* option choices */}
        {awaiting?.type === "options" && (
          <div className="flex flex-col items-end gap-1.5 pt-1">
            {awaiting.options?.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChooseOption(o.id, o.label)}
                className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {o.label}
              </button>
            ))}
            {(!awaiting.options || awaiting.options.length === 0) && (
              <p className="text-xs text-muted-foreground">Este nodo no tiene opciones configuradas.</p>
            )}
          </div>
        )}
      </div>

      {/* input */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleSubmit()
            }}
            disabled={awaiting?.type !== "input"}
            placeholder={
              awaiting?.type === "input"
                ? awaiting.placeholder || "Escribe tu respuesta…"
                : "Esperando al bot…"
            }
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={awaiting?.type !== "input" || !inputValue.trim()}
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{message.text}</span>
      </div>
    )
  }
  const isUser = message.role === "user"
  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      <Avatar role={message.role} />
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {message.text}
      </div>
    </div>
  )
}

function Avatar({ role }: { role: "bot" | "user" }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        role === "bot" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground",
      )}
    >
      {role === "bot" ? <Bot className="size-4" /> : <User className="size-4" />}
    </span>
  )
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: delay }} />
}
