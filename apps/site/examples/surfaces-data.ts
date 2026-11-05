import { createSceneStore, type SceneDefinition, type SceneStore } from '@opsorama/core';
import { SURFACE_LEVELS, type FloorFinish } from '@opsorama/renderer-three';

const quarter = Math.PI / 2, sidewalk = SURFACE_LEVELS.sidewalk;
/**
 * Street composition fixture: a main road along x at z = 0 with a T-junction branch toward +z.
 * Sidewalk centers sit 3 m + depth/2 from the road center; corner pieces turn their curbs toward the junction.
 * Positions are illustrative; no addresses, traffic or parking occupancy are inferred.
 */
export const surfacesDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'ground', kind: 'ground', size: [30, 22], position: [0, 0, -1] },
  { id: 'road-west', kind: 'asset', asset: 'road', variant: 'straight', position: [-12, 0, 0] },
  { id: 'crosswalk', kind: 'asset', asset: 'road', variant: 'crosswalk', position: [-6, 0, 0], label: 'Crosswalk', selectable: true },
  { id: 'junction', kind: 'asset', asset: 'road', variant: 't-junction', position: [0, 0, 0], label: 'T-junction', selectable: true },
  { id: 'road-east', kind: 'asset', asset: 'road', variant: 'straight', position: [6, 0, 0] },
  { id: 'road-east-end', kind: 'asset', asset: 'road', variant: 'straight', position: [12, 0, 0] },
  { id: 'road-branch', kind: 'asset', asset: 'road', variant: 'straight', position: [0, 0, 6], rotation: [0, quarter, 0] },
  { id: 'sidewalk-back', kind: 'asset', asset: 'sidewalk', footprint: [30, 2], position: [0, 0, -4], label: 'Sidewalk · 30 m', selectable: true },
  { id: 'sidewalk-front-west', kind: 'asset', asset: 'sidewalk', footprint: [10, 2], position: [-10, 0, 4], rotation: [0, Math.PI, 0] },
  { id: 'sidewalk-front-east', kind: 'asset', asset: 'sidewalk', footprint: [10, 2], position: [10, 0, 4], rotation: [0, Math.PI, 0] },
  { id: 'corner-west', kind: 'asset', asset: 'sidewalk', variant: 'corner', position: [-4, 0, 4], rotation: [0, quarter, 0] },
  { id: 'corner-east', kind: 'asset', asset: 'sidewalk', variant: 'corner', position: [4, 0, 4], rotation: [0, Math.PI, 0] },
  { id: 'sidewalk-branch-west', kind: 'asset', asset: 'sidewalk', footprint: [4, 2], position: [-4, 0, 7], rotation: [0, quarter, 0] },
  { id: 'sidewalk-branch-east', kind: 'asset', asset: 'sidewalk', footprint: [4, 2], position: [4, 0, 7], rotation: [0, -quarter, 0] },
  { id: 'parking', kind: 'asset', asset: 'terrain', variant: 'parking', footprint: [12.5, 5], position: [-8.75, 0, -7.5], label: 'Parking · 5 bays', selectable: true },
  { id: 'van', kind: 'asset', asset: 'delivery-van', position: [-11.25, 0, -7.7] },
  { id: 'terrace', kind: 'asset', asset: 'floor', variant: 'tiles', footprint: [10, 6], position: [8, 0, -8], label: 'Terrace floor', selectable: true },
  { id: 'pavilion', kind: 'asset', asset: 'pavilion', position: [8, 0, -8.5] },
  { id: 'lawn', kind: 'asset', asset: 'terrain', variant: 'grass', footprint: [10, 5], position: [-10, 0, 7.5], label: 'Lawn', selectable: true },
  { id: 'gravel', kind: 'asset', asset: 'terrain', variant: 'gravel', footprint: [10, 5], position: [10, 0, 7.5] },
  { id: 'tree-1', kind: 'asset', asset: 'tree', position: [-12.5, 0, 8] },
  { id: 'tree-2', kind: 'asset', asset: 'tree-pine', position: [-8, 0, 7.2] },
  { id: 'lamp-1', kind: 'asset', asset: 'lamp-post', position: [-9, sidewalk, -4.6] },
  { id: 'lamp-2', kind: 'asset', asset: 'lamp-post', position: [3, sidewalk, -4.6] },
  { id: 'bench', kind: 'asset', asset: 'bench', position: [12, sidewalk, -4.3] },
] };
export const makeSurfacesStore = () => createSceneStore(surfacesDefinition, { shadows: false, motion: false, zoom: .9 });
export interface SurfacesSession { store: SceneStore; dispose(): void; }
export function updateSurfaces(store: SceneStore, finish: FloorFinish, midnight: boolean) {
  const terrace = store.getSnapshot().nodes.find(node => node.id === 'terrace');
  if (terrace?.kind === 'asset' && terrace.variant !== finish) store.upsert({ ...terrace, variant: finish });
  store.configure({ theme: midnight ? 'midnight' : 'light' });
}
