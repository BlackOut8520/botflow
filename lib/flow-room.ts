export interface FlowListEntry {
  id: string
  name: string
  updatedAt: string
}

interface RoomMap<T> {
  keys(): IterableIterator<string>
  delete(id: string): unknown
  set(id: string, value: T): unknown
}

interface Identified {
  id: string
}

/** Gate import replacement until Liveblocks storage is loaded, and never replay it. */
export function shouldReplaceRoomStorage(
  requested: boolean,
  alreadyReplaced: boolean,
  storageLoaded: boolean,
): boolean {
  return requested && !alreadyReplaced && storageLoaded
}

/** Keep the selected flow addressable even when it was created after the server render. */
export function includeActiveFlow(
  initialFlows: readonly FlowListEntry[],
  activeFlow: FlowListEntry | null,
): FlowListEntry[] {
  if (!activeFlow) return [...initialFlows]
  const summary = { id: activeFlow.id, name: activeFlow.name, updatedAt: activeFlow.updatedAt }
  const index = initialFlows.findIndex((flow) => flow.id === activeFlow.id)
  if (index === -1) return [summary, ...initialFlows]
  return initialFlows.map((flow, flowIndex) => (flowIndex === index ? summary : flow))
}

/** Replace a room map exactly, removing stale ids as well as updating shared ids. */
export function replaceRoomMapContents<TInput extends Identified, TStored>(
  roomMap: RoomMap<TStored>,
  values: readonly TInput[],
  toStored: (value: TInput) => TStored,
): void {
  for (const id of Array.from(roomMap.keys())) roomMap.delete(id)
  for (const value of values) roomMap.set(value.id, toStored(value))
}
