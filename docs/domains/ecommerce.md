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

## Decisions of the shift

A director decides who works where, which orders go first, which checkout lanes are open and when the forklift unloads a docked truck: `createEcommerceSimulation(scenario, seed, { director })`. The simulation asks it as it runs, so a director changes its mind by answering differently.

- **Zones:** `zone(person)` is asked whenever a person is free and applies before their next task, so nobody drops a task halfway. A packer first finishes the orders on their bench. Pickers, sorters and the dispatcher keep their zone; the people who carry by hand (packers, the replenisher and the shelf filler) move between packing, replenishing and restocking, and packing needs a free bench. `simulation.staff()` lists each person's zone and the zones they can move to now.
- **Priorities:** pickers and packers take orders with a higher `priority(order)` first, for example one carrier's orders.
- **Checkouts:** a lane for which `checkoutOpen(lane)` turns false takes no new customers and closes once the customers on their way to it are served; a closed lane opens with a cashier.
- **Unloading:** while `unload(dock)` is false, a docked truck waits and an unloading truck pauses.
- **Machines:** while `running(machine)` is false, the forklift, reach truck or a robot finishes its task, then stops and shows as critical.
- **Footfall:** `shoppers(usual)` sets how many customers the shop draws in at once.
- **Moves of material:** `job(actor, auto)` gives the next move of a commanded actor, asked whenever it is free; `auto()` returns the automatic choice. See below.
- **Departure:** while `depart(dock)` is true, the truck loading at the outbound dock leaves as soon as no roll cage is on its way to it.

The dashboard uses `automaticDirector`: everyone keeps their zone, orders go in order of arrival, lanes stay as they are, trucks unload on arrival, every commanded actor takes its automatic move and the outbound truck leaves when nothing is staged for it or after three trips. A director passes only the decisions it changes; the rest stay automatic.

### Commanded moves

The forklift, the reach truck and whoever works in the replenishing, restocking or dispatch zone (the replenisher, the shelf filler and the dispatcher) move material only through moves the director returns. Every automatic job is split into choosing a move and building its task, so a director can give any move the automatic one could make:

| Move | Actor | Material and target | Repeats until |
| --- | --- | --- | --- |
| `unload` | Forklift | the next pallet off the truck at an inbound dock into the first free staging spot | the truck is empty |
| `put-away` | Reach truck | a pallet in staging into a rack, on its lowest free position or a given `level` | one pallet |
| `replenish` | Reach truck | a pallet in a rack to the spot behind the pick face of its SKU | one pallet |
| `clear` | Reach truck | the empty pallet behind a pick face to the empty-pallet stack | one pallet |
| `decant` | Replenisher | cartons from the pallet behind a pick face into its lanes | the pallet is empty |
| `restock` | Shelf filler | cartons from a department's pick face to its gondolas, or one shop transfer | the department is full or the face reaches its minimum |
| `ship` | Dispatcher | a roll cage's parcels onto the truck of its carrier at the outbound dock | one cage |

- **Repeating:** a repeating move is a series of short tasks. The director is asked between them and continues the move by returning it again, or stops it after the current pallet or carton by returning something else or nothing. Tasks are never undone halfway.
- **Checks:** a move is checked when it starts. When its target has no room (staging full, the spot behind a pick face taken, the lanes full, the pallet not yet behind the face), the actor waits and starts by itself once there is room. Otherwise the move ends as refused with its reason.
- **Events:** `move-ended` reports a move that is `done`, whose source `emptied`, whose target `filled`, or that was `refused`, before the actor asks again; `move-waiting` reports the start of a wait. `unloaded`, `replenished` and `restocked` report material arriving, and `put-away` says whether a pallet went in as overflow.
- **Menus:** `simulation.actors()` lists the commanded actors with their task, move and wait; `check(actor, move)` says whether a move can start now; `moves(actor, subject)` lists the moves an actor can make with a scene node (a dock, a pallet, a pick face, a gondola or a roll cage), best target first, and the targets it may not use with their reasons, for example `R04 holds Outdoor goods and does not take Toys (TOY-120).`

The `goodsRules` option makes storage follow the type of goods (`rackGoods`, `skuGoods`): Kitchen, Home, Outdoor, Toys and Tech each have a front-row rack and the back-row rack behind it (Kitchen two of each), and Bulky racks hold bulky goods. A pallet goes only into a rack of its type, and there is no overflow: a type whose racks are full takes no more pallets until replenishing frees a position. Deliveries therefore bring only as many pallets of a type as its racks can still take, counting the pallets in staging and on trucks. The check is a host `rule` on the shared `HandlingState`, so `targets` and `refusals` give the same answers that `moves` shows. With `goodsRules`, pick-face lanes also take no more cartons than they hold. With `directorDeparts`, the outbound truck leaves only when the director's `depart` says so. The dashboard runs without both.

For a host that keeps score, `subscribe` (or the `onEvent` option, which also receives the events of the starting state) reports orders placed, parcels shipped per carrier, click & collect handovers, customers served, short picks, pallets put away and the moves of material above. `cancel(orderId)` drops an order nobody works on yet, and the `walkOutAt` option makes customers who find that many people queuing leave without paying. The Cut-off shift game in `apps/site/src/features/cutoff/rules.ts` is built on these: plain TypeScript rules with commanded moves, events with choices, a score and an end-of-shift report. The player queues up to three moves per actor, can switch an actor to work by itself (assist), and sends the outbound truck, which otherwise leaves at its carrier's cut-off. Its page, `/examples/cutoff`, plays a shift in React through context menus over the clicked object, with a shift summary on the left and the detail of the selected object on the right; pallets and racks take the color of their type of goods, and the HUD uses the same panels as the dashboard.

## Integration boundary

Replace `simulation.ts` with confirmed task events and records from the shop platform, warehouse management system, yard or transport system and carriers, keeping its `snapshot` and `nodes` shape. Releasing waves, reprioritising orders, booking docks and opening lanes stay in those systems. No connector is implemented, and FPS has not been profiled on a GPU.
