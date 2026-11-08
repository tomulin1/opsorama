# Domain recipe: regional distribution centre

Updated: November 8, 2026. Status: working local example at `/examples/warehouse` (Domain 02).

## User and spatial meaning

A shift lead, dock coordinator or warehouse manager of a regional distribution centre sees the whole site at once. They answer: which dock doors are busy and which trucks wait in the yard or arrived late, how many received pallets still wait for putaway, which outbound loads may miss their departure, how full the racks are and where a location is blocked or needs replenishment, which forklifts, reach trucks and robots are working, charging or tagged out, and whether the chilled chamber is within its temperature range.

The layout follows a common real-world pattern rather than a measured building. All sixteen dock doors share one front (U-flow): receiving doors on the west, dispatch doors on the east, one yard for both. Fast movers stay close to the docks.

| Area | What the models show |
| --- | --- |
| Truck yard & gate | Gatehouse with in and out booms, trucks at the doors and in eight numbered stalls, a container drop area, staff parking with chargers, a sprinkler tank and a waste point; a truck circles through the gates |
| Receiving (D01–D08) | Loading docks with open or closed shutters, one pallet per received pallet waiting in the door lane (up to ten), a receiving desk |
| Dispatch (D09–D16) | Loading docks, one pallet per picked but not yet loaded pallet in the door lane, two stretch wrappers |
| Reserve racking | Seven aisles of selective pallet racks, ten bays per side; level 0 is the case-pick face, levels 1–2 hold reserve pallets. Each bay draws its exact pallet count (0–6); an aisle sign names every aisle |
| Chilled chamber | Two chilled aisles behind insulated walls, a door display with the temperature and a status beacon |
| Hazardous goods cage, bulk | IBC tanks and drums behind welded mesh; block-stacked pallets and the empty pallet store |
| Each picking | Carton flow racks and shelving; pickers push carts through the pick aisles to the conveyor induct |
| AMR sortation | Mobile robots loop past two rows of put walls; parcels leave the conveyor into roll cages |
| Packing & VAS | Seven pack benches along the conveyor, value-added service benches, consumables and a high-value cage |
| Returns, dock office, MHE charging | Inspection benches, totes and a quarantine cage; the dock schedule board and a clock; chargers and a service bay for tagged-out trucks |

## Data

`apps/site/src/features/warehouse/model.ts` defines the host records:

- **Docks and yard** (yard management): door status, the truck at each door and in each stall, check-in times, and dropped trailers that do not count as waiting.
- **Deliveries** (advance shipping notices) with supplier, carrier, slot, pallets and pallets received; chilled and hazardous flags.
- **Loads** with route, stops, carrier, departure and pallets picked and loaded, plus short picks.
- **Locations**: a fill target per aisle from which every bay's pallet count is derived deterministically, and location issues (rack damage, count difference, pick face to replenish).
- **Fleet** (telematics): status, battery, area, aisle and operator of every forklift, reach truck and mobile robot.
- **Chilled chamber** reading, setpoint and door-open time; picking progress; returns; crew per area; events.

Three mock snapshots cover the morning inbound peak, the afternoon dispatch wave and night replenishment. The scene, metrics, alerts and panels are derived from the same snapshot; the dashboard never changes records and sends no commands.

Rules are explicit and shown in the inspectors: a delivery is late after a 15 minute grace period, a truck may wait 45 minutes in the yard, more than 30 pallets in the receiving lanes is a putaway backlog, the chilled chamber warns from 4.5 °C and alarms from 5 °C, a battery below 20 % is low, and a load is at risk when the estimated work left (1.5 minutes per pallet to load, 3 minutes per pallet to pick) exceeds the time to its departure.

## Counts, alerts and motion

Counts are exact and bounded: one pallet load per occupied rack position, one pallet per staged pallet in a door lane up to ten (the panels keep the exact number), flow racks, shelves, put walls and roll cages filled by the snapshot. People are drawn up to a bounded number per area.

Every alert names the node it belongs to. Alerts on a model get a scene marker above it (rack damage, a tagged-out vehicle, a load at risk at its door, a late or long-waiting truck, the chilled chamber); area pins take the most severe state of the alerts inside them.

Working vehicles, pickers and robots follow fixed demonstration loops: forklifts carry a pallet through the cross aisle, reach trucks work down one aisle, stop facing a bay and return through the next one, robots pass the put walls. This is illustrative motion, not task playback or tracked movement. Scene motion-off and reduced motion stop it.

## Limits

- Rack bays are 4.5 m selective racking with three beam levels; the example does not model very narrow aisle high-bay racking, a mezzanine or an automated storage system.
- Trucks are the catalog's rigid box truck; the yard has no articulated trucks, detached trailers or yard tractors.
- Frame rate on a GPU has not been measured for this scene; it is the largest domain example by node count.
