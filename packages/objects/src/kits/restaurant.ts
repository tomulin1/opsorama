import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createBarCounter, createBarStool, createBoothSeating, createDiningTable, createDishMachine, createEspressoMachine, createHeatedPass, createHostStand, createMenuBoard, createPatioUmbrella, createPickupShelf, createPizzaOven, createServingPlates, createWalkInCooler } from '../restaurant';

/**
 * Restaurant kit of the object catalog: `dining-table`, `booth-seating`, `bar-counter`, `bar-stool`, `espresso-machine`, `pizza-oven`, `walk-in-cooler`, `heated-pass`, `pickup-shelf`, `host-stand`, `menu-board`, `dish-machine`, `patio-umbrella`, `serving-plates`.
 * Import it from `@opsorama/objects/restaurant` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const restaurantKit: AssetRegistry = catalogEntries({
  'dining-table': createDiningTable,
  'booth-seating': createBoothSeating,
  'bar-counter': createBarCounter,
  'bar-stool': createBarStool,
  'espresso-machine': createEspressoMachine,
  'pizza-oven': createPizzaOven,
  'walk-in-cooler': createWalkInCooler,
  'heated-pass': createHeatedPass,
  'pickup-shelf': createPickupShelf,
  'host-stand': createHostStand,
  'menu-board': createMenuBoard,
  'dish-machine': createDishMachine,
  'patio-umbrella': createPatioUmbrella,
  'serving-plates': createServingPlates,
});
