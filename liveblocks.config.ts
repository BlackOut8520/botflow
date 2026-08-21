import type { JsonObject, LiveMap, LiveObject } from "@liveblocks/client";
import type { BotEdge, BotNode } from "@/lib/flow-types";

/**
 * Node data as it lives in the room.
 *
 * `BotNodeData` declares `[key: string]: unknown`, which is wider than Liveblocks'
 * `Json`, so the room-side shape is an open JSON record. Everything the editor puts
 * in there is plain JSON at runtime — it has to be, Liveblocks serializes it over
 * the wire — and readers recover the richer `BotNodeData` shape once the value
 * leaves storage.
 */
export type StoredNodeData = JsonObject;

/**
 * JSON-serializable mirror of the React Flow node stored in the room. Only the
 * fields the editor reads or writes through Liveblocks are declared.
 */
export type StoredNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: StoredNodeData;
  measured?: { width: number; height: number };
  selected?: boolean;
};

/** JSON-serializable mirror of the React Flow edge stored in the room. */
export type StoredEdge = {
  id: string;
  type?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: JsonObject;
};

/**
 * `cursor` is optional because `RoomProvider` mounts without an `initialPresence`:
 * a user has no cursor until their first pointer move over the canvas.
 */
export type Presence = {
  cursor?: { x: number; y: number } | null;
};

export type Storage = {
  nodes: LiveMap<string, LiveObject<StoredNode>>;
  edges: LiveMap<string, LiveObject<StoredEdge>>;
};

/** Shape produced by `/api/liveblocks-auth` for every session. */
export type UserMeta = {
  id: string;
  info: { name: string; color: string };
};

declare global {
  interface Liveblocks {
    Presence: Presence;
    Storage: Storage;
    UserMeta: UserMeta;
  }
}

/**
 * React Flow's `Node`/`Edge` types can never satisfy Liveblocks' `Lson` constraint:
 * their `data` is an open `unknown` record, and `unknown` is wider than `Json`. The
 * values are JSON in practice, so the three helpers below are the single sanctioned
 * frontier where that gap is bridged — the cast stays here instead of leaking into
 * the editor.
 */
export function toStoredNode(node: BotNode): StoredNode {
  return node as unknown as StoredNode;
}

export function toStoredEdge(edge: BotEdge): StoredEdge {
  return edge as unknown as StoredEdge;
}

export function toStoredNodeData(data: Record<string, unknown>): StoredNodeData {
  return data as unknown as StoredNodeData;
}
