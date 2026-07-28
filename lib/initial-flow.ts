import type { BotNode, BotEdge } from "./flow-types"

export const initialNodes: BotNode[] = [
  {
    id: "start",
    type: "bot",
    position: { x: 0, y: 160 },
    data: { kind: "start", label: "Inicio" },
  },
  {
    id: "welcome",
    type: "bot",
    position: { x: 240, y: 140 },
    data: {
      kind: "message",
      label: "Bienvenida",
      text: "¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte hoy?",
    },
  },
  {
    id: "menu",
    type: "bot",
    position: { x: 520, y: 120 },
    data: {
      kind: "question",
      label: "Menú principal",
      text: "Elige una opción:",
      options: [
        { id: "opt-sales", label: "Ventas" },
        { id: "opt-support", label: "Soporte" },
      ],
    },
  },
  {
    id: "ask-name",
    type: "bot",
    position: { x: 840, y: 20 },
    data: {
      kind: "input",
      label: "Pedir nombre",
      text: "Genial. ¿Cuál es tu nombre?",
      variable: "nombre",
      placeholder: "Escribe tu nombre...",
    },
  },
  {
    id: "sales-end",
    type: "bot",
    position: { x: 1140, y: 20 },
    data: {
      kind: "message",
      label: "Cierre ventas",
      text: "¡Gracias {{nombre}}! Un asesor de ventas te contactará pronto.",
    },
  },
  {
    id: "support-action",
    type: "bot",
    position: { x: 840, y: 260 },
    data: {
      kind: "action",
      label: "Crear ticket",
      actionName: "POST /api/tickets",
      actionDetail: "Crea un ticket de soporte en el sistema",
    },
  },
  {
    id: "support-end",
    type: "bot",
    position: { x: 1140, y: 260 },
    data: {
      kind: "message",
      label: "Cierre soporte",
      text: "Hemos registrado tu solicitud. Un agente te atenderá enseguida.",
    },
  },
  {
    id: "end",
    type: "bot",
    position: { x: 1440, y: 140 },
    data: { kind: "end", label: "Fin" },
  },
]

export const initialEdges: BotEdge[] = [
  { id: "e-start-welcome", source: "start", target: "welcome" },
  { id: "e-welcome-menu", source: "welcome", target: "menu" },
  { id: "e-menu-name", source: "menu", sourceHandle: "opt-sales", target: "ask-name" },
  { id: "e-menu-support", source: "menu", sourceHandle: "opt-support", target: "support-action" },
  { id: "e-name-salesend", source: "ask-name", target: "sales-end" },
  { id: "e-salesend-end", source: "sales-end", target: "end" },
  { id: "e-support-supportend", source: "support-action", target: "support-end" },
  { id: "e-supportend-end", source: "support-end", target: "end" },
]
