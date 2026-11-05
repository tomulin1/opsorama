import { createSceneStore, type SceneDefinition, type SceneNode, type SceneStore, type VisualState } from '@opsorama/core';

const asset = (id: string, type: string, position: readonly [number, number], label?: string, extra: Partial<Extract<SceneNode, { kind: 'asset' }>> = {}): SceneNode =>
  ({ id, kind: 'asset', asset: type, position: [position[0], 0, position[1]], ...(label ? { label, selectable: true } : { selectable: false }), ...extra });

/** Warehouse object composition; counts are decorative capacity and no SKU, stock or order records are inferred. */
export const warehouseObjectsDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'ground', kind: 'ground', size: [30, 20] },
  asset('rack-1', 'pallet-rack', [-9.5, -6], 'Pallet rack · 6 loads', { count: 6 }),
  asset('rack-2', 'pallet-rack', [-6.75, -6], undefined, { count: 4 }),
  asset('rack-3', 'pallet-rack', [-4, -6], undefined, { count: 2 }),
  asset('barrier-1', 'safety-barrier', [-12, -5.3], undefined, { variant: 'rail', rotation: [0, Math.PI / 2, 0] }),
  asset('barrier-2', 'safety-barrier', [-1.5, -5.3], undefined, { variant: 'rail', rotation: [0, Math.PI / 2, 0] }),
  asset('bollard-1', 'safety-barrier', [-1.5, -3.6], 'Safety bollard', { variant: 'bollard' }),
  asset('reach-truck', 'reach-truck', [-6.75, -2.6], 'Reach truck', { rotation: [0, Math.PI, 0] }),
  asset('flow-1', 'carton-flow-rack', [2, -6.2], 'Carton flow rack', { count: 10 }),
  asset('flow-2', 'carton-flow-rack', [4.1, -6.2], undefined, { count: 6 }),
  asset('wrapper', 'stretch-wrapper', [5.5, 2.5], 'Stretch wrapper'),
  asset('pallets', 'pallet-stack', [9.5, 3], 'Pallet stack · 8', { count: 8 }),
  asset('forklift', 'forklift', [1.5, 2.5], 'Forklift', { rotation: [0, Math.PI / 2, 0] }),
  asset('ibc-1', 'ibc-tank', [-10, 4], 'IBC tanks'),
  asset('ibc-2', 'ibc-tank', [-8.6, 4]),
  asset('drums', 'drum-pallet', [-6.6, 4], 'Drums on pallet', { count: 4 }),
  asset('bulk-1', 'bulk-bag', [-4.6, 4], 'Bulk bag'),
  asset('bulk-2', 'bulk-bag', [-3.2, 4], undefined, { color: '#d9cfc2' }),
] };
export const makeWarehouseObjectsStore = () => createSceneStore(warehouseObjectsDefinition, { shadows: false, zoom: .95 });
export interface WarehouseObjectsSession { store: SceneStore; dispose(): void; }
export interface WarehouseObjectsOptions { wrapperStopped: boolean; midnight: boolean; }
/** A stopped wrapper is a local fixture toggle, not equipment telemetry. */
export function updateWarehouseObjects(store: SceneStore, options: WarehouseObjectsOptions) {
  const wrapper = store.getSnapshot().nodes.find(node => node.id === 'wrapper'), state: VisualState | undefined = options.wrapperStopped ? 'inactive' : undefined;
  if (wrapper?.kind === 'asset' && wrapper.state !== state) store.upsert({ ...wrapper, state });
  store.configure({ theme: options.midnight ? 'midnight' : 'light' });
}
