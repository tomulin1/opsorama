# Domain recipe: online shop and fulfilment centre

Updated: October 31, 2026. Status: working local example at `/examples/ecommerce` (Domain 01); guide at `/docs/recipes/ecommerce`.

## User and spatial meaning

A shop or operations manager sees the shop floor and the warehouse that fulfils online orders on one site. They answer: which orders are at risk of the carrier cut-off, where is a given order, which pick faces are short, which inbound trucks are late, and how busy the checkouts and click & collect counter are.

The scene is an illustrative floor plan, not a measured building. Each process area is a zone with a status pin:

| Area | Site | What the models show |
| --- | --- | --- |
| Shop floor | Shop | Five rows of gondolas in ten departments with stocked facings; browsing shoppers |
| Checkouts | Shop | Three lanes; one figure per queued customer; closed lanes are grey |
| Click & collect | Shop | One parcel per ready order on the counter; parcel lockers outside |
| Receiving | Warehouse | Inbound docks D1–D2 on a sunken truck apron, trucks that drive in and leave, the staging lane, receiving check, forklift |
| Reserve storage | Warehouse | Pallet racks R01–R14 in two rows on two aisles, one real pallet per occupied position; reach truck |
| Forward picking | Warehouse | Flow racks F1–F4 (filled lanes) and shelves S1–S2 (occupied bins); pickers with carts; a replenisher behind the faces |
| Sortation | Warehouse | Conveyor with riding totes, mobile robots, put walls P1–P2 (one cubby per order) |
| Packing | Warehouse | Benches K1–K3; an open carton shows the order being packed |
| Dispatch | Warehouse | Roll cages per carrier (one parcel per staged order) that the dispatcher pushes to outbound dock D3, stretch wrapper |
| Returns | Warehouse | Inspection bench, returns tote, quarantine cage |

## Data

`apps/site/src/features/ecommerce/model.ts` defines the host records:

- **Orders** with channel (web shop, marketplace, click & collect, shop transfer), stage (released, picking, sorting, packing, ready to ship, ready to collect), lines with ordered and picked quantities, carrier, value and an optional issue. An order is at risk when its carrier cut-off is within 60 minutes and it is not yet staged.
- **Locations**: occupancy per rack bay, flow rack and shelf, and SKU alerts with the replenishment task.
- **Docks**, **crew per area**, **robots**, **returns**, the **shop** (browsing shoppers, checkout lanes, click & collect, lockers, sales, facings per department) and **events**.

Three scenarios cover a Monday morning peak, a Wednesday afternoon and a Sunday night shift. Each is the starting point of a seeded mock feed, `apps/site/src/features/ecommerce/simulation.ts`. The scene, metrics and panels are derived from the same snapshot, and the dashboard itself never changes records.

## Motion

Objects really move, and a record changes when its object arrives. Pallets, totes, parcels, bags and roll cages are units in one handling state, moved by agents in one behavior runner on one movement graph with lanes per agent kind.

- **Inbound and put-away:** a truck reverses onto a dock, the forklift unloads it into the staging lane, and the reach truck lifts each pallet to its rack level, reaches in, sets it down and backs away.
- **Replenishment:** when a SKU falls below its minimum, the reach truck brings a pallet from reserve to the back of its pick face, the replenisher decants it carton by carton, and the empty pallet goes back to the stack.
- **Fulfilment:** a picker pushes a cart along the pick faces and slides a tote from the cart onto the conveyor beside it; the tote rides onto a robot at the end of the belt; a sorter takes it off the robot into a put wall; a packer fetches the order, packs it and brings the parcel to a roll cage or the click & collect counter.
- **Dispatch:** the dispatcher pushes a cage to the outbound truck, and the parcels ship.
- **Purchases:** shoppers walk in one at a time, take goods from the gondolas into a basket, queue, pay and leave with a bag; the scenario's starting customers are already at their shelf or in line. A shelf filler restocks low departments through the staff door. Click & collect customers take their parcel from the counter.

Pallets ride with their long side along the forks and keep that orientation at every hand-over, so in the racks their short side faces the aisle. Nothing flies: a load changes place only on forks, on the belt, on a robot or in the hands of a person standing within reach. Flow lanes, gondolas, put walls, cages and the counter stay count-based: a unit that reaches one is absorbed into its count. Returns and the pallet on the stretch wrapper stay static.

Pause in the toolbar stops the scene and the feed together. With motion off or reduced motion the records keep running and objects show their confirmed places without travel.

## Integration boundary

Replace `simulation.ts` with confirmed task events and records from the shop platform, warehouse management system, yard or transport system and carriers, keeping its `snapshot` and `nodes` shape. Releasing waves, reprioritising orders, booking docks and opening lanes stay in those systems. No connector is implemented, and FPS has not been profiled on a GPU.
