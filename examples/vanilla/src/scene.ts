import { createSceneStore, type SceneDefinition, type SceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { furnitureKit } from '@opsorama/objects/furniture';

/** Only the catalog kits this scene uses: work items (parcel, pallet) and furniture (shelf). */
export const assets = createAssetRegistry(workItemsKit, furnitureKit);

/** Visual nodes only. Your application keeps the order records; `entityId` links a node back to one. */
export const definition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [22, 12] },
  { id: 'new', kind: 'zone', position: [-4, 0, 0], size: [7, 7], label: 'NEW ORDERS', color: '#deebfb' },
  { id: 'ready', kind: 'zone', position: [4, 0, 0], size: [7, 7], label: 'READY TO SHIP', color: '#dfefe6' },
  { id: 'stock', kind: 'asset', asset: 'shelf', position: [-4, 0, -2.6], count: 8, label: 'Stock' },
  { id: 'outbound', kind: 'asset', asset: 'pallet', position: [5.2, 0, -1.8], count: 12, label: 'Outbound pallet' },
  { id: 'order-1001', entityId: '1001', kind: 'asset', asset: 'parcel', position: [-5, .1, 1], label: '#1001' },
  { id: 'order-1002', entityId: '1002', kind: 'asset', asset: 'parcel', position: [-3, .1, 1.8], label: '#1002' },
  { id: 'order-1003', entityId: '1003', kind: 'asset', asset: 'parcel', position: [3.4, .1, 1.2], label: '#1003' },
] };

/** A new store with the starter scene. The host owns the store: call `store.dispose()` when the dashboard goes away for good. */
export function createStarterStore(): SceneStore { return createSceneStore(definition); }

/** Moves order #1001 to the ready zone and selects it, as a host would after its own data changed. */
export function shipOrder(store: SceneStore): void {
  const node = store.getSnapshot().nodes.find(item => item.id === 'order-1001');
  if (node?.kind !== 'asset') return;
  store.upsert({ ...node, position: [4.6, .1, 2] });
  store.select('order-1001');
}
