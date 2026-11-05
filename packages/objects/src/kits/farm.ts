import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createBarn, createChickenCoop, createCropField, createHayBale, createPaddockFence, createTrough } from '../farm';

/**
 * Farm kit of the object catalog: `barn`, `paddock-fence`, `hay-bale`, `trough`, `chicken-coop`, `crop-field`.
 * Import it from `@opsorama/objects/farm` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const farmKit: AssetRegistry = catalogEntries({
  barn: createBarn,
  'paddock-fence': createPaddockFence,
  'hay-bale': createHayBale,
  trough: createTrough,
  'chicken-coop': createChickenCoop,
  'crop-field': createCropField,
});
