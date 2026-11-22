import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
// Brings the catalog's typed AssetOptions (module augmentation of @opsorama/core) to every consumer of this kit.
import '../options';
import { createFloor, createRoad, createSidewalk, createTerrain } from '../surfaces';

/**
 * Surfaces kit of the object catalog: `road`, `sidewalk`, `floor`, `terrain`.
 * Import it from `@opsorama/objects/surfaces` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const surfacesKit: AssetRegistry = catalogEntries({
  road: createRoad,
  sidewalk: createSidewalk,
  floor: createFloor,
  terrain: createTerrain,
});
