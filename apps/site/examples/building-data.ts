import { bindBuildingInterior, createSceneStore, type BuildingLoadState, type SceneDefinition, type SceneNode, type SceneStore } from '@opsorama/core';

export const buildingDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'ground', kind: 'ground', size: [26, 13] },
  { id: 'workshop', kind: 'asset', asset: 'building', position: [-6, 0, 0], rotation: [0, -.15, 0], label: 'Workshop', selectable: true, building: { type: 'workshop', size: [8, 3.6, 6], peekOnHover: true } },
  { id: 'office', kind: 'asset', asset: 'building', position: [6, 0, 0], rotation: [0, .2, 0], label: 'Office', selectable: true, building: { type: 'office', size: [8, 3.2, 6], peekOnHover: true, colors: { roof: '#487e74' } } },
] };
/** Fictional visual fixtures; no inventory, bookings or people identities are inferred. */
export function buildingContents(id: 'workshop' | 'office'): readonly SceneNode[] {
  return id === 'workshop' ? [
    { id: 'workshop-shelf', kind: 'asset', asset: 'shelf', count: 0, position: [-2, .12, -1.5], label: 'Empty shelf', selectable: true },
    { id: 'workshop-tote', kind: 'asset', asset: 'tote', count: 0, position: [2, .12, 1], label: 'Empty tote', selectable: true },
    { id: 'workshop-bench', kind: 'asset', asset: 'bench', position: [1.8, .12, -1.4], label: 'Workshop bench', selectable: true },
  ] : [
    { id: 'office-desk', kind: 'asset', asset: 'desk-pod', count: 1, position: [-1.6, .12, -.8], label: 'Office desk', selectable: true },
    { id: 'office-board', kind: 'asset', asset: 'whiteboard', count: 0, position: [1.8, .12, -1.7], label: 'Office board', selectable: true },
    { id: 'office-plant', kind: 'asset', asset: 'potted-plant', position: [2, .12, 1.6], label: 'Office plant', selectable: true },
  ];
}
export interface BuildingSession { store: SceneStore; dispose(): void; }
export type BuildingStateCallback = (id: 'workshop' | 'office', state: BuildingLoadState, error?: Error) => void;
export function makeBuildingSession(onState: BuildingStateCallback) {
  const store = createSceneStore(buildingDefinition, { motion: false, shadows: false, zoom: 1.2 });
  const unbind = (['workshop', 'office'] as const).map(id => bindBuildingInterior(store, id, signal => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Loading cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(buildingContents(id)); }, 350);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }), (state, error) => onState(id, state, error)));
  return { store, unbind: () => unbind.forEach(dispose => dispose()) };
}
