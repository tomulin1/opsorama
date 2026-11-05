import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createCoolingUnit, createNetworkSwitch, createRackServer, createUpsUnit } from '../datacenter';
import { createAirCooledChiller, createAisleContainment, createBatteryBank, createElectricalSwitchgear, createGeneratorSet } from '../facility';

/**
 * Datacenter / IT kit of the object catalog: `generator-set`, `air-cooled-chiller`, `electrical-switchgear`, `battery-bank`, `aisle-containment`, `rack-server`, `network-switch`, `cooling-unit`, `ups-unit`.
 * Import it from `@opsorama/objects/datacenter` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const datacenterKit: AssetRegistry = catalogEntries({
  'generator-set': createGeneratorSet,
  'air-cooled-chiller': createAirCooledChiller,
  'electrical-switchgear': createElectricalSwitchgear,
  'battery-bank': createBatteryBank,
  'aisle-containment': createAisleContainment,
  'rack-server': createRackServer,
  'network-switch': createNetworkSwitch,
  'cooling-unit': createCoolingUnit,
  'ups-unit': createUpsUnit,
});
