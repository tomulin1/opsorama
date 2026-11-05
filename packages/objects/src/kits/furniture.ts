import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createHospitalBed, createServiceCart } from '../care';
import { createShelf, createStation } from '../generic-models';
import { createParcelLocker, createReturnsDropBox } from '../retail';
import { createCartonFlowRack, createPalletRack } from '../warehouse';

/**
 * Furniture kit of the object catalog: `shelf`, `parcel-locker`, `returns-drop-box`, `station`, `hospital-bed`, `service-cart`, `pallet-rack`, `carton-flow-rack`.
 * Import it from `@opsorama/objects/furniture` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const furnitureKit: AssetRegistry = catalogEntries({
  shelf: createShelf,
  'parcel-locker': createParcelLocker,
  'returns-drop-box': createReturnsDropBox,
  station: createStation,
  'hospital-bed': createHospitalBed,
  'service-cart': createServiceCart,
  'pallet-rack': createPalletRack,
  'carton-flow-rack': createCartonFlowRack,
});
