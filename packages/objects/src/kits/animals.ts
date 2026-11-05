import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
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
