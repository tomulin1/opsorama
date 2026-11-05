import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createCheckoutCounter, createClickCollectCounter, createStoreShelving } from '../retail';

/**
 * Retail kit of the object catalog: `click-collect-counter`, `checkout-counter`, `store-shelving`.
 * Import it from `@opsorama/objects/retail` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const retailKit: AssetRegistry = catalogEntries({
  'click-collect-counter': createClickCollectCounter,
  'checkout-counter': createCheckoutCounter,
  'store-shelving': createStoreShelving,
});
