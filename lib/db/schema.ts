import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core"
import type { BotNode, BotEdge } from "@/lib/flow-types"

export const flows = pgTable("flows", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Flujo sin título"),
  nodes: jsonb("nodes").$type<BotNode[]>().notNull().default([]),
  edges: jsonb("edges").$type<BotEdge[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type FlowRow = typeof flows.$inferSelect
