import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createEvCharger, createPumpUnit, createSolarArray, createStorageTank, createWindTurbine } from '../energy';
import { createValve } from '../industry';

/**
 * Energy kit of the object catalog: `ev-charger`, `solar-array`, `wind-turbine`, `storage-tank`, `pump-unit`, `valve`.
 * Import it from `@opsorama/objects/energy` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const energyKit: AssetRegistry = catalogEntries({
  'ev-charger': createEvCharger,
  'solar-array': createSolarArray,
  'wind-turbine': createWindTurbine,
  'storage-tank': createStorageTank,
  'pump-unit': createPumpUnit,
  valve: createValve,
});
