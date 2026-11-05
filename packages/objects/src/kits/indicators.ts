import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createBatteryIndicator, createDialGauge, createRingGauge } from '../gauges';
import { createCapacityGauge, createMapPin, createSign, createStatusBeacon } from '../signals';

/**
 * Indicators kit of the object catalog: `ring-gauge`, `dial-gauge`, `battery-indicator`, `status-beacon`, `capacity-gauge`, `map-pin`, `sign`.
 * Import it from `@opsorama/objects/indicators` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const indicatorsKit: AssetRegistry = catalogEntries({
  'ring-gauge': createRingGauge,
  'dial-gauge': createDialGauge,
  'battery-indicator': createBatteryIndicator,
  'status-beacon': createStatusBeacon,
  'capacity-gauge': createCapacityGauge,
  'map-pin': createMapPin,
  sign: createSign,
});
