import type { DocArticle } from './content';
export const ecommerceArticle: DocArticle = {
  slug: 'recipes/ecommerce', title: 'Online shop & fulfilment centre', category: 'RECIPES',
  description: 'A shop with customers and the warehouse that fulfils its online orders, composed from shared catalog objects in one full-viewport React scene.',
  sections: [
    { id: 'site', title: 'One site, ten process areas', paragraphs: [
      '/examples/ecommerce shows a shop (shop floor, checkouts, click & collect, parcel lockers and a returns box) next to its fulfilment warehouse: receiving with two inbound docks, two rows of reserve pallet racks on two aisles, forward picking on carton flow racks and shelves, sortation with a conveyor, robots and put walls, packing benches, dispatch with roll cages, a stretch wrapper and an outbound dock, and returns with a quarantine cage.',
      'Each process area is a selectable zone node. Choosing an area in the scene or in the Areas panel opens its inspector and filters the order table. Area positions are illustrative and do not encode measured floor plans.',
    ] },
    { id: 'data', title: 'Snapshot records and what the models count', paragraphs: [
      'src/features/ecommerce/model.ts holds three scenarios (Monday morning peak, Wednesday afternoon, Sunday night shift). Each lists open orders with lines and picked quantities, occupancy per storage location, stock alerts, docks, crew per area, returns and the shop state, and each is the starting point of a mock feed. Metrics, panels and scene nodes are all derived from the current snapshot.',
      'Racks hold real pallets: one object per occupied position. Other counts on models are exact and bounded: one filled lane per stocked flow-rack lane (0–12), one box per occupied shelf bin, one parcel per staged order in a roll cage (12 per cage, overflow disclosed), one parcel per ready click & collect order on the counter (up to 8), stocked facings per gondola (0–24) and one figure per customer in a checkout queue. Totals stay in the HTML panels.',
    ] },
    { id: 'motion', title: 'Real objects on planned routes', paragraphs: [
      'src/features/ecommerce/simulation.ts is a seeded mock feed that starts from a scenario and keeps going. Pallets, totes, parcels, bags and roll cages are units in one HandlingState, and one behavior runner moves them over the movement graph in scene.ts, where each agent kind has its own lanes. A pick-up or put-down is a checked move, and a record changes when the object arrives: rack occupancy when the pallet lands, an order stage when its tote reaches the put wall, stock when a carton is decanted. Nothing flies: a load moves only on forks, on the belt, on a robot or in the hands of a person standing within reach, and the reach truck lifts each pallet to its rack level, reaches in and backs away.',
      'The feed covers inbound and put-away, replenishment from reserve to the pick faces, picking through sortation and packing to dispatch, shop purchases from shelf to bag, shelf restocking and click & collect pickups. Flow lanes, gondolas, put walls, cages and the counter stay count-based, so a unit that reaches one is absorbed into its count. The simulation runs in fixed steps, so the outcome does not depend on the frame rate.',
    ], code: `// The reach truck lifts a pallet to level 1, reaches over the place and lowers it there.
// moveForks publishes the moves on the truck node; the pallet rises on the load anchor.
const before = [{ height: 1.45, seconds: 1.45 }, { height: 1.45, reach: 1, seconds: 1 }, { height: 1.33, reach: 1, seconds: .25 }];
moveForks('reach-truck', before);
runner.assign('reach-truck', [
  { kind: 'interact', node: 'rack:R03', slot: 'load-0', seconds: 3, putDown: 'all', putOn: { receptacle: 'level-1', position: 0 } },
]);`, language: 'typescript' },
    { id: 'hud', title: 'Full-viewport scene with a floating HUD', paragraphs: [
      'The page follows ADR 0022: one SceneCanvas fills the window, the navigation panel and four MetricCards float at the top, Areas/Inspector on the right, Orders, Stock, Docks and Info on the left, and the ZoomControl and toolbar at the bottom, where Pause stops the scene and the feed together. Expanded view covers the site header and Escape leaves it; hiding panels keeps the same canvas.',
      'The HUD uses the shared DataPanel, MetricCard, ResourceList, ActivityFeed, ProcessTracker, FieldList, StatusBadge and ValueMeter components. Domain fields stay in the example; the generic UI package has no e-commerce fields.',
    ] },
    { id: 'scope', title: 'Sources and current boundaries', paragraphs: [
      'Replace simulation.ts with task events and records from your shop, warehouse management and carrier systems, keeping its snapshot and nodes shape. The dashboard sends no commands: releasing waves, reprioritising orders, booking docks and opening checkouts stay in those systems. Returns and the pallet on the stretch wrapper stay static.',
      'The example mounts one React scene. Adapter parity is shown by /examples/adapters, the object pages and tests. FPS and draw calls of the full scene were not profiled.',
    ] },
  ],
};
