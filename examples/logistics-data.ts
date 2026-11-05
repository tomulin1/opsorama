import { createSceneStore, type SceneDefinition, type SceneStore } from '@opsorama/core';

/** Object composition fixture; positions are illustrative and no shipment or inventory records are inferred. */
export const logisticsDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'container', kind: 'asset', asset: 'shipping-container', position: [-5, 0, -1], label: 'Shipping container', selectable: true },
  { id: 'dock', kind: 'asset', asset: 'loading-dock', variant: 'closed', position: [0, 0, -3], label: 'Loading dock', selectable: true },
  { id: 'forklift', kind: 'asset', asset: 'forklift', position: [4, 0, 1], label: 'Forklift', selectable: true },
  { id: 'pallet', kind: 'asset', asset: 'pallet', count: 8, position: [0, 0, 1], label: 'Pallet · decorative boxes', selectable: true },
] };
export const makeLogisticsStore = () => createSceneStore(logisticsDefinition, { shadows: false, motion: false, zoom: 1.4 });
export interface LogisticsSession { store: SceneStore; dispose(): void; }
export function updateLogistics(store: SceneStore, open: boolean, midnight: boolean) {
  const dock = store.getSnapshot().nodes.find(node => node.id === 'dock');
  if (dock?.kind === 'asset') store.upsert({ ...dock, variant: open ? 'open' : 'closed' });
  store.configure({ theme: midnight ? 'midnight' : 'light' });
}
