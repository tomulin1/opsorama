import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
// Brings the catalog's typed AssetOptions (module augmentation of @opsorama/core) to every consumer of this kit.
import '../options';
import { createBird, createCat, createChicken, createCow, createDog, createHorse, createPig, createSheep } from '../animals';

/**
 * Animals kit of the object catalog: `cow`, `horse`, `sheep`, `pig`, `chicken`, `dog`, `cat`, `bird`.
 * Import it from `@opsorama/objects/animals` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const animalsKit: AssetRegistry = catalogEntries({
  cow: createCow,
  horse: createHorse,
  sheep: createSheep,
  pig: createPig,
  chicken: createChicken,
  dog: createDog,
  cat: createCat,
  bird: createBird,
});
