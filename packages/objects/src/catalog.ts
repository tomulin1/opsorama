import { createAssetRegistry } from '@opsorama/three';
import { datacenterKit } from './kits/datacenter';
import { displaysKit } from './kits/displays';
import { buildingsKit } from './kits/buildings';
import { indicatorsKit } from './kits/indicators';
import { workItemsKit } from './kits/work-items';
import { peopleKit } from './kits/people';
import { furnitureKit } from './kits/furniture';
import { equipmentKit } from './kits/equipment';
import { officeKit } from './kits/office';
import { retailKit } from './kits/retail';
import { fulfillmentKit } from './kits/fulfillment';
import { vehiclesKit } from './kits/vehicles';
import { environmentKit } from './kits/environment';
import { surfacesKit } from './kits/surfaces';
import { energyKit } from './kits/energy';
import { eventsKit } from './kits/events';
import { restaurantKit } from './kits/restaurant';
import { aquaticsKit } from './kits/aquatics';
import { animalsKit } from './kits/animals';
import { farmKit } from './kits/farm';
import { laboratoryKit } from './kits/laboratory';

/**
 * Every catalog model, keyed by asset name: all 21 kits merged. Pass it as the renderer's `assets` option, or merge it with custom
 * factories through `createAssetRegistry`. Scenes that use a few kinds of objects can import only those kits from their subpaths instead,
 * for example `@opsorama/objects/vehicles`.
 */
export const catalogAssets = createAssetRegistry(datacenterKit, displaysKit, buildingsKit, indicatorsKit, workItemsKit, peopleKit, furnitureKit, equipmentKit, officeKit, retailKit, fulfillmentKit, vehiclesKit, environmentKit, surfacesKit, energyKit, eventsKit, restaurantKit, aquaticsKit, animalsKit, farmKit, laboratoryKit);

/** Kit names in the order of the object browser categories; each is also the subpath `@opsorama/objects/<name>`. */
export const CATALOG_KITS = Object.freeze(["datacenter", "displays", "buildings", "indicators", "work-items", "people", "furniture", "equipment", "office", "retail", "fulfillment", "vehicles", "environment", "surfaces", "energy", "events", "restaurant", "aquatics", "animals", "farm", "laboratory"] as const);
export type CatalogKit = typeof CATALOG_KITS[number];
