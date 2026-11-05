import { describe, expect, it } from 'vitest';
import { CATALOG_KITS, catalogAssets } from '@opsorama/objects';
import { datacenterKit } from '@opsorama/objects/datacenter';
import { displaysKit } from '@opsorama/objects/displays';
import { buildingsKit } from '@opsorama/objects/buildings';
import { indicatorsKit } from '@opsorama/objects/indicators';
import { workItemsKit } from '@opsorama/objects/work-items';
import { peopleKit } from '@opsorama/objects/people';
import { furnitureKit } from '@opsorama/objects/furniture';
import { equipmentKit } from '@opsorama/objects/equipment';
import { officeKit } from '@opsorama/objects/office';
import { retailKit } from '@opsorama/objects/retail';
import { fulfillmentKit } from '@opsorama/objects/fulfillment';
import { vehiclesKit } from '@opsorama/objects/vehicles';
import { environmentKit } from '@opsorama/objects/environment';
import { surfacesKit } from '@opsorama/objects/surfaces';
import { energyKit } from '@opsorama/objects/energy';
import { eventsKit } from '@opsorama/objects/events';
import { restaurantKit } from '@opsorama/objects/restaurant';
import { aquaticsKit } from '@opsorama/objects/aquatics';
import { animalsKit } from '@opsorama/objects/animals';
import { farmKit } from '@opsorama/objects/farm';
import { laboratoryKit } from '@opsorama/objects/laboratory';
import { catalogObjects } from '../apps/site/src/features/docs/objects';

/** Every kit subpath with the object browser category it mirrors. */
const kits = {
  "datacenter": { kit: datacenterKit, category: "Datacenter / IT" },
  "displays": { kit: displaysKit, category: "Displays & time" },
  "buildings": { kit: buildingsKit, category: "Buildings" },
  "indicators": { kit: indicatorsKit, category: "Indicators" },
  "work-items": { kit: workItemsKit, category: "Work items" },
  "people": { kit: peopleKit, category: "People" },
  "furniture": { kit: furnitureKit, category: "Furniture" },
  "equipment": { kit: equipmentKit, category: "Equipment" },
  "office": { kit: officeKit, category: "Office" },
  "retail": { kit: retailKit, category: "Retail" },
  "fulfillment": { kit: fulfillmentKit, category: "Fulfillment" },
  "vehicles": { kit: vehiclesKit, category: "Vehicles" },
  "environment": { kit: environmentKit, category: "Environment" },
  "surfaces": { kit: surfacesKit, category: "Surfaces" },
  "energy": { kit: energyKit, category: "Energy" },
  "events": { kit: eventsKit, category: "Events" },
  "restaurant": { kit: restaurantKit, category: "Restaurant" },
  "aquatics": { kit: aquaticsKit, category: "Aquatics" },
  "animals": { kit: animalsKit, category: "Animals" },
  "farm": { kit: farmKit, category: "Farm" },
  "laboratory": { kit: laboratoryKit, category: "Laboratory" },
} as const;

describe('catalog kits', () => {
  it('lists every kit once, in browser category order', () => {
    expect(Object.keys(kits)).toEqual([...CATALOG_KITS]);
  });

  it('splits the catalog into disjoint kits whose union is catalogAssets', () => {
    const seen = new Map<string, string>();
    for (const [name, { kit }] of Object.entries(kits)) for (const key of Object.keys(kit)) {
      expect(seen.get(key), `${key} is in ${seen.get(key)} and ${name}`).toBeUndefined();
      seen.set(key, name);
      expect(catalogAssets[key], key).toBe(kit[key]);
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(catalogAssets).sort());
  });

  it('matches the object browser categories, so there is one taxonomy', () => {
    for (const { kit, category } of Object.values(kits)) {
      const browser = catalogObjects.filter(item => item.asset && item.category === category).map(item => item.asset!).sort();
      expect(Object.keys(kit).sort(), category).toEqual(browser);
    }
  });
});
