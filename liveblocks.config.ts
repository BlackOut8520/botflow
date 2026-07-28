import { LiveMap, LiveObject } from "@liveblocks/client";
import type { BotNode } from "@/lib/flow-types";
import type { Edge } from "@xyflow/react";

export type Presence = {
  cursor: { x: number; y: number } | null;
};

export type Storage = {
  nodes: LiveMap<string, LiveObject<BotNode>>;
  edges: LiveMap<string, LiveObject<Edge>>;
};
