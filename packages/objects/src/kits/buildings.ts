import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createGrainSilo } from '../agriculture';
import { createBuilding } from '../building';
import { createPavilion } from '../generic-models';
import { createGate } from '../handling';
import { createLoadingDock, createShippingContainer } from '../logistics';
import { createCustomerHouse, createStorefront } from '../retail';
import { createWallSegment } from '../structures';

/**
 * Buildings kit of the object catalog: `building`, `gate`, `wall-segment`, `customer-house`, `storefront`, `pavilion`, `grain-silo`, `loading-dock`, `shipping-container`.
 * Import it from `@opsorama/objects/buildings` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const buildingsKit: AssetRegistry = catalogEntries({
  building: createBuilding,
  gate: createGate,
  'wall-segment': createWallSegment,
  'customer-house': createCustomerHouse,
  storefront: createStorefront,
  pavilion: createPavilion,
  'grain-silo': createGrainSilo,
  'loading-dock': createLoadingDock,
  'shipping-container': createShippingContainer,
});
