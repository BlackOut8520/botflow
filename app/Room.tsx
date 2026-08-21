"use client";

import { ReactNode } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  ClientSideSuspense,
} from "@liveblocks/react/suspense";
import { LiveMap, LiveObject } from "@liveblocks/client";
import type { BotNode } from "@/lib/flow-types";
import type { Edge } from "@xyflow/react";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function NamePrompt({ onNameSet }: { onNameSet: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("botflow-name");
    if (!saved) {
      setOpen(true);
    } else {
      onNameSet();
    }
  }, [onNameSet]);

  const handleSave = () => {
    if (name.trim()) {
      localStorage.setItem("botflow-name", name.trim());
      setOpen(false);
      onNameSet();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle>Bienvenido a Botflow</DialogTitle>
          <DialogDescription>
            Ingresa tu nombre para que tus compañeros puedan identificarte en el lienzo colaborativo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Ej. Fulanito" 
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name.trim()}>Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Room({ 
  roomId, 
  initialNodes,
  initialEdges,
  children 
}: { 
  roomId: string;
  initialNodes: BotNode[];
  initialEdges: Edge[];
  children: ReactNode; 
}) {
  const [readyToConnect, setReadyToConnect] = useState(false);

  return (
    <>
      <NamePrompt onNameSet={() => setReadyToConnect(true)} />
      {readyToConnect && (
        <LiveblocksProvider authEndpoint={async (room) => {
          const name = localStorage.getItem("botflow-name") || "Anónimo";
          const res = await fetch("/api/liveblocks-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room, name }),
          });
          return await res.json();
        }}>
      <RoomProvider 
        id={`${roomId}-v2`}
        initialStorage={{
          nodes: new LiveMap(initialNodes.map(n => [n.id, new LiveObject(n)])),
          edges: new LiveMap(initialEdges.map(e => [e.id, new LiveObject(e)])),
        }}
      >
        <ClientSideSuspense fallback={
          <div className="flex h-screen w-screen flex-col items-center justify-center bg-background space-y-4">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground animate-pulse text-sm font-medium">Conectando a la sala colaborativa...</p>
          </div>
        }>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
    )}
    </>
  );
}
