import { createHandlingState, createMoveMode, createSceneStore, type AssetNode, type HandlingMove, type HandlingState, type MoveMode, type MoveRequest, type ResolvedTarget, type SceneDefinition, type SceneStore } from '@opsorama/core';
import { assetHandling, bindMoveMode, handlingProfiles, type SceneRenderer } from '@opsorama/renderer-three';

/** Move mode fixture: objects are illustrative and no stock or order records are inferred. */
const unit = (id: string, asset: string, label: string): AssetNode => ({ id, kind: 'asset', asset, label, labelMode: 'active', selectable: true });
const parcels = Array.from({ length: 6 }, (_, i) => `parcel-${i + 1}`), totes = ['tote-1', 'tote-2'];
const units: readonly AssetNode[] = [
  ...parcels.map((id, i) => unit(id, 'parcel', `Parcel ${i + 1}`)),
  ...totes.map((id, i) => unit(id, 'tote', `Tote ${i + 1}`)),
  { ...unit('pallet-a', 'pallet', 'Pallet A'), count: 0 },
  { ...unit('pallet-b', 'pallet', 'Pallet B'), count: 0 },
];
const containers: readonly AssetNode[] = [
  { ...unit('rack', 'pallet-rack', 'Pallet rack'), count: 0, position: [-4, 0, -2.5] },
  { ...unit('shelf', 'shelf', 'Storage shelf'), count: 0, position: [3.5, 0, -2.5] },
  { ...unit('jack', 'pallet-jack', 'Pallet jack'), position: [6, 0, 2] },
  { ...unit('picker', 'worker', 'Picker'), variant: 'holding', position: [0, 0, -1.5] },
];
export const moveModeDefinition: SceneDefinition = { schemaVersion: 1, nodes: [{ id: 'floor', kind: 'ground', size: [18, 12] }, ...containers, ...units] };
export const moveModeUnits = units.map(node => ({ id: node.id, label: node.label ?? node.id }));
const labelOf = (id: string) => moveModeDefinition.nodes.find(node => node.id === id)?.label ?? id;

/** Reader-facing name of a target, for the HTML list. */
export function targetLabel({ target, placement }: ResolvedTarget): string {
  const place = target.pattern ? `layer ${placement.layer + 1}, position ${(placement.position ?? 0) + 1}` : `position ${(placement.position ?? 0) + 1}`;
  return `${labelOf(placement.container)}, ${placement.receptacle}, ${place}`;
}

export interface MoveModeSession {
  store: SceneStore;
  handling: HandlingState;
  mode: MoveMode;
  /** Requests so far, newest first. */
  getLog(): readonly string[];
  /** Called after each request. */
  subscribeLog(listener: () => void): () => void;
  /** Connect the renderer once it is ready; `dispose` disconnects it. */
  connect(renderer: SceneRenderer): void;
  dispose(): void;
}

const start: readonly HandlingMove[] = [
  { unit: 'pallet-a', to: { position: [-1.5, 0, 2.5], yaw: 0 } },
  { unit: 'pallet-b', to: { position: [2, 0, 2.5], yaw: 0 } },
  ...parcels.map(id => ({ unit: id, to: { container: 'pallet-a', receptacle: 'deck' } })),
  ...totes.map(id => ({ unit: id, to: { container: 'shelf', receptacle: 'level-0' } })),
];

/**
 * One scene with handling state and move mode. Selecting a unit begins move mode, and the host
 * accepts each valid request: a real host would run its own command first. Nothing here is part
 * of a domain dashboard; move mode is optional interactivity.
 */
export function createMoveModeSession(): MoveModeSession {
  const store = createSceneStore(moveModeDefinition, { shadows: false, motion: true, zoom: 1.4 });
  const handling = createHandlingState({
    handling: assetHandling, profiles: handlingProfiles,
    instances: moveModeDefinition.nodes.flatMap(node => node.kind === 'asset' ? [{ id: node.id, asset: node.asset }] : []),
  });
  handling.move(start);
  const applyPatches = (transfer: boolean) => {
    for (const patch of handling.nodePatches()) {
      const node = store.getSnapshot().nodes.find(entry => entry.id === patch.id);
      if (node) store.upsert({ ...node, ...patch, ...(transfer ? { transfer: { seconds: .5 } } : {}) });
    }
  };
  applyPatches(false);
  let log: readonly string[] = [];
  const logListeners = new Set<() => void>();
  const onRequest = (request: MoveRequest) => {
    const accepted = request.check.ok && handling.move([{ unit: request.unit, to: request.target.target }])[0].ok;
    log = [`${labelOf(request.unit)} → ${targetLabel(request.target)}: ${accepted ? 'moved' : request.check.violations[0]?.message ?? 'refused'}`, ...log].slice(0, 6);
    for (const listener of [...logListeners]) listener();
    if (accepted) { applyPatches(true); store.select(null, 'api'); }
  };
  const mode = createMoveMode({ handling, onRequest });
  let selected: string | null = null;
  const stopSelection = store.subscribe(() => {
    const next = store.getSnapshot().selection?.nodeId ?? null;
    if (next === selected) return;
    selected = next;
    if (next !== null && moveModeUnits.some(entry => entry.id === next)) mode.begin(next); else mode.cancel();
  });
  let disconnect: (() => void) | undefined;
  return {
    store, handling, mode,
    getLog: () => log,
    subscribeLog(listener) { logListeners.add(listener); return () => { logListeners.delete(listener); }; },
    connect(renderer) { disconnect?.(); disconnect = bindMoveMode(renderer, mode); },
    dispose() { disconnect?.(); stopSelection(); mode.dispose(); store.dispose(); },
  };
}
