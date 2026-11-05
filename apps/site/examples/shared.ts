import { createSceneStore, type SceneDefinition } from '@opsorama/core';
export const minimalDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [22, 12] },
  { id: 'new', kind: 'zone', position: [-4, 0, 0], size: [7, 7], label: 'NEW ORDERS', color: '#deebfb' },
  { id: 'ready', kind: 'zone', position: [4, 0, 0], size: [7, 7], label: 'READY TO SHIP', color: '#dfefe6' },
  { id: 'sample-1', entityId: '1001', kind: 'asset', asset: 'parcel', position: [-5, .1, 0], label: '#1001' },
  { id: 'sample-2', entityId: '1002', kind: 'asset', asset: 'parcel', position: [-3, .1, 1.5], label: '#1002' },
  { id: 'sample-3', entityId: '1003', kind: 'asset', asset: 'parcel', position: [4, .1, 0], label: '#1003' },
] };
export const makeExampleStore = () => createSceneStore(minimalDefinition);
export function moveSample(store: ReturnType<typeof createSceneStore>) { const node = store.getSnapshot().nodes.find(n => n.id === 'sample-1')!; store.upsert({ ...node, position: [5, .1, 1.5] }); store.select('sample-1'); }
