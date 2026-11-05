import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createTractor } from '../agriculture';
import { createAircraft, createBaggageCart } from '../airport';
import { createMobileRobot } from '../automation';
import { createForklift } from '../logistics';
import { createCargoBike, createDeliveryVan, createPalletJack, createTruck } from '../vehicles';
import { createReachTruck } from '../warehouse';

/**
 * Vehicles kit of the object catalog: `truck`, `delivery-van`, `cargo-bike`, `pallet-jack`, `mobile-robot`, `aircraft`, `baggage-cart`, `tractor`, `reach-truck`, `forklift`.
 * Import it from `@opsorama/objects/vehicles` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const vehiclesKit: AssetRegistry = catalogEntries({
  truck: createTruck,
  'delivery-van': createDeliveryVan,
  'cargo-bike': createCargoBike,
  'pallet-jack': createPalletJack,
  'mobile-robot': createMobileRobot,
  aircraft: createAircraft,
  'baggage-cart': createBaggageCart,
  tractor: createTractor,
  'reach-truck': createReachTruck,
  forklift: createForklift,
});
