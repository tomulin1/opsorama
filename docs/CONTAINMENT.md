# Handling units, receptacles and moves

Status: **H0–H3 implemented ([ADR 0058](decisions/0058-handling-compatibility.md), [ADR 0060](decisions/0060-handling-state.md), [ADR 0061](decisions/0061-agents-with-handling-state.md), [ADR 0062](decisions/0062-move-mode.md), [ADR 0063](decisions/0063-handling-domains.md)); H5 is a proposal**. Written October 29, 2026, when the user asked how to unify boxes, totes, bags, crates and pallets so they behave as in reality: a pallet carries several exactly specified box types, racks and shelves accept what their domain allows, and a parcel or item can move from place to place between compatible places, containers and pallets. H0 implemented the vocabulary, declarations, model check and catalog view: `HANDLING_FAMILIES`, `HandlingProfile`, `AssetHandling`, `validateHandlingProfile`, `validateAssetHandling` and `handlingFits` in core; `logisticsProfile`, `assetHandling` and `checkAssetHandling` in the renderer package; documented at `/docs/handling`. H1 implemented `createHandlingState` in core. H2 connected the behavior runner through its `handling` option. H3 added optional move mode. H4 added `rail` and `bulk`, unit variants and three more profiles. H5 is still a proposal.

## Problem

The toolkit already has the pieces of physical containment, but each covers one case and none of them knows what fits where:

| Existing contract | What it does | What is missing |
| --- | --- | --- |
| `Attachment` ([OBJECT_COMPOSITION.md](OBJECT_COMPOSITION.md)) | A node's transform follows a parent's named anchor | No notion of what the anchor accepts, how many units, or where the next unit goes |
| `ItemPlacement`, `CarryRule` ([ADR 0029](decisions/0029-carried-items.md)) | The behavior runner moves host items between agents and objects | One stack per anchor, fixed 0.4 m stack height, no compatibility, no positions |
| Storage anchors `slot-*`, `load`, `stock-*`, `mount`, `module-*`, `contents` | Places where items rest on the shelf, pallet rack, pavilion, pallet, cabinets, UPS, parcel and bag | Names only; a host guesses which item may go there |
| `ContainerContents` | Host lines with quantities on a cart or open parcel | No unit identities; it cannot be moved line by line |
| `count` compositions ([QUANTITY_SCALING.md](QUANTITY_SCALING.md)) | Decorative boxes on pallets, shelves and racks | Decorative fill and real units can overlap |
| `NodeTransfer` ([ADR 0039](decisions/0039-movement-follow-ups.md)) | Animates a change of attachment | Nothing decides whether the change is allowed |

Consequences today: a host can attach a pallet to a shelf slot, put a server on a pallet or stack nine parcels on a worker's hands, and nothing reports it. Every example repeats its own offsets for deck heights and box spacing.

## Goal

One generic, typed and declarative model for **physical containment of visual nodes**:

1. Every movable thing is a **handling unit** with a class, a size and stacking rules.
2. Every place that holds units is a **receptacle** with an arrangement, an envelope and accepted unit families. Shelves, rack bays, pallet decks, cart floors, truck beds, locker cells, cabinet rails, worker hands and forklift forks are all receptacles.
3. **Domain profiles** supply the shared vocabulary of unit classes and default rules per domain, so logistics, retail, datacenter, laboratory and restaurant scenes do not each invent their own.
4. A move is checked before it is applied. A failed check names the violation and the fix. A checked move maps onto the existing `attachment` and `transfer`, so the renderer, React and Vue need no new runtime for the basic case.
5. The object catalog shows each object's compatibility (what it fits into, what it holds) from the same declarations, from the first phase on.

Out of scope, and remaining host-owned: inventory records, SKUs, orders, stock levels, business rules (hazardous goods, temperature, customer segregation, FIFO policy), bin-packing optimisation, physics and collision response.

## Concepts

### Handling unit

A node that moves as one piece. The descriptor of its asset declares a `unit` profile:

- **class**: one handling-class ID from a domain profile, e.g. `logistics/carton-m`, `logistics/industrial-pallet`, `datacenter/server-2u`.
- **family**: the generic group the class belongs to (see below). Receptacles accept families or classes, never asset keys, so a new asset with a known class works with every existing receptacle.
- **size**: footprint and height in metres, from the class nominal size or from the model bounds times the node's `scale`. Placement scale stays a placement transform, never a quantity.
- **stacking**: how many units of what families may rest on it (`maxAbove`), and whether it may be turned 90° in a pattern.
- **mass** (optional, kg): only when a receptacle declares a load limit. A host record can override it per node.

A unit can also be a container. A pallet is a unit (class `logistics/industrial-pallet`) with a `deck` receptacle; a tote is a unit with a `bulk` receptacle; a truck is a vehicle with a `deck`. Containment is a tree: item → tote → shelf slot → shelf → building.

### Families

A closed, generic enum in core. Domain profiles add classes inside these families; they do not add families.

| Family | Meaning | Examples |
| --- | --- | --- |
| `item` | Single goods without their own container | product, lab flask, plate, cup |
| `case` | Rigid box carried by hand or conveyed | carton, parcel, tote, crate, order bin |
| `soft-pack` | Flexible pack, hung or laid down | shopping bag, poly mailer, mail sack |
| `tray` | Flat carrier of items | lab tray, food tray |
| `unit-load` | Moved by forks or a pallet jack | loaded pallet, drum pallet, IBC tank, bulk bag, pallet stack |
| `wheeled` | Rolled, not lifted | roll cage, picking cart, shopping cart |
| `module` | Mounted equipment on rails | rack server, network switch, UPS module |

### Receptacle

A named place on a container that holds units. Declared in the container's descriptor next to its anchors, in model-local metres:

- **anchor**: the existing model anchor at the receptacle origin (`slot-4`, `load`, `mount`, `carry`). The check already compares anchors with the model, so receptacles inherit that verification.
- **arrangement**: how units are positioned (next section).
- **accepts**: families, optionally narrowed to classes.
- **envelope**: footprint and clear height. A loaded pallet's height includes its load, so a full pallet can be too tall for a rack bay.
- **capacity / positions**: units or rail positions.
- **access**: which unit can be taken: `any`, `top` (only the top of a stack or the top layer), `front` (first in a flow lane, FIFO), `back`.
- **reachedFrom** (optional): the interaction-slot group from which an agent reaches it, e.g. the shelf's `pick` slots. Agents use slots; receptacles describe where units are.
- **maxMass** (optional, kg).

All five arrangements below are implemented, with anchors, accepts, envelope, offset, capacity, patterns and `reachedFrom`. Access follows from the arrangement (slot and rail: any unit, stack and deck: top only, bulk: host lines). The `access` field and `maxMass` remain proposals.

Arrangements:

| Arrangement | Positions | Used by |
| --- | --- | --- |
| `slot` | Exactly one unit | Shelf `slot-0…11`, pallet-rack `slot-0…5`, locker cell, put-wall cell, restaurant pass `slot-*` |
| `stack` | Vertical pile, bottom first; each level rests on the unit below | Worker hands, pallet-jack load, pallet stack, parcel on parcel |
| `deck` | A surface with layers; each layer uses a declared load pattern or free positions | Pallet, picking cart, roll cage, van, shipping container, lab tray |
| `rail` | Integer positions along a line; a unit spans one or more positions | Equipment cabinet in rack units, UPS modules, carton-flow lane, conveyor |
| `bulk` | No positions; host `ContainerContents` lines without identities | Tote with nine items, shopping cart, open parcel, bag |

### Load patterns and mixed loads

A pallet carries several exactly specified box types through **layers**. Each layer either names a load pattern or lists free positions:

- A **load pattern** is a named, declared layout of one class on a deck type: positions, yaw and layer height, e.g. `carton-m-3x2` (six medium cartons, 0.4 m high) or `tote-2x2`. Patterns are data in the domain profile; the toolkit does not search for packings.
- A **free layer** lists explicit positions (`offset`, `yaw`, class). The check rejects overlaps, positions outside the envelope and units without support below.
- Each layer rests on the top of the tallest unit of the layer below, so heights never come from guessed offsets.

Example of one mixed pallet, bottom first:

| Layer | Pattern | Units |
| --- | --- | --- |
| 0 | `carton-l-2x2` | 4 large cartons |
| 1 | `carton-m-3x2` | 6 medium cartons |
| 2 | free | 2 totes and 1 bulk bag position left empty |

A unit's placement then names the layer and the position in that layer: `{ container: 'pallet-7', receptacle: 'deck', layer: 1, position: 4 }`.

### Domain profiles

A domain profile is data: the unit classes of a domain, their nominal sizes and stacking rules, the load patterns, and default `accepts` for catalog receptacles in that domain. A scene lists the profiles it uses (`['logistics', 'retail']` for e-commerce). Resolution order, where each step can only **narrow** what the previous one allows, like motion overrides:

1. the receptacle's generic `accepts` in the asset descriptor;
2. the scene's domain profiles (e.g. `restaurant` lets shelf slots accept `restaurant/crate` and `restaurant/ingredient-box`, but not `logistics/carton-l`);
3. instance narrowing on the node (e.g. one rack bay reserved for drums);
4. physical checks: envelope, rail span, support, stack limit, mass, access;
5. an optional host rule callback for business vetoes, reported as `host-rule` with the host's reason.

Proposed built-in profiles, all generic and free of business meaning:

| Profile | Classes (proposed IDs) | Typical receptacles |
| --- | --- | --- |
| `logistics` | `carton-s`, `carton-m`, `carton-l`, `tote`, `crate`, `poly-mailer`, `mail-sack`, `pallet`, `drum-pallet`, `ibc`, `bulk-bag`, `pallet-stack`, `roll-cage` | Shelf and flow-rack lanes: `case`, `soft-pack`. Rack bays, forks, pallet-jack load, truck and container decks: `unit-load`. Pallet deck: `case`, `soft-pack`, drums. Roll cage and picking cart: `case`, `soft-pack`. Put wall and lockers: `case` up to `carton-m`, `soft-pack`. Worker hands: `case` up to `carton-m`, `soft-pack` |
| `retail` | `product-s`, `product-m`, `basket`, `shopping-bag` | Store shelving: `item`. Hand basket and shopping cart: `bulk` lines. Checkout: `item`, `soft-pack` |
| `datacenter` | `server-1u`, `server-2u`, `switch-1u`, `ups-module` | Cabinet `rail` with one position per mounted-unit place (the model shows 0–12 today): `module`. UPS `module-*` slots |
| `laboratory` | `flask`, `lab-tray` | Lab tray deck: `flask`. Workstation `tray` slot: `lab-tray` |
| `restaurant` | `plate`, `cup`, `food-tray`, `crate`, `ingredient-box` | Pass `slot-*`: `plate`, `food-tray`. Storage shelf: `crate`, `ingredient-box`. Table top: `item`, `tray` |

### Placement and state

Implemented in H1 ([ADR 0060](decisions/0060-handling-state.md)); `packages/core/src/handling-state.ts` documents each type. `createHandlingState` tracks registered nodes. A `HandlingTarget` is what a caller asks for, and a `UnitPlacement` is the resolved place with its anchor and local offset. `check`, `move`, `targets`, `sync`, `placement`, `contents`, `path`, `nodePatches` and `subscribe` are the API. Compared with the original proposal: `rank` replaces `near`, because the state does not know world positions; mass and the `over-mass` code are left out; targets and placements are separate types. See `/docs/handling` for runnable usage.

Two operating modes, chosen per call rather than by a global flag:

- **Checked commands** (`check`, `move`): the toolkit refuses an invalid move and changes nothing. Used by UI move mode and agents.
- **Host-authoritative sync** (`sync`): real source data can be physically impossible, for example a WMS that records a pallet in a shelf slot. The unit is shown where the source says, the violation is reported as data, and the host decides how to present it. Data is never silently dropped or moved.

Moving a container moves its contents automatically, because units are attached to their container's anchors. Removing a container leaves its units unplaced and reported, matching the current rule that missing parents are dormant.

## How it composes with existing contracts

| Existing | Proposed role |
| --- | --- |
| `ObjectDescriptor` | Implemented in H0 as a separate data registry, `assetHandling`, like `assetInteractionSlots`, because most declared assets have no descriptor yet. `checkAssetHandling` verifies anchors, unit size, envelopes inside the model footprint, slot clearance and the reaching slot group; core validation checks patterns inside their deck without overlap |
| Anchors | Unchanged; receptacles reference them. Repeated decorative parts still get no identities |
| `Attachment` and `NodeTransfer` | The output of a move: `nodePatches` sets attachment and offset, an optional transfer animates it under the scene motion policy |
| `ItemPlacement` and `CarryRule` | With the runner's `handling` option, a carry rule resolves to the receptacle at its anchor (worker `carry`, pallet-jack and reach-truck `load`, forklift forks), and `pickUp`, `putDown` and `putOn` are checked moves. Without it, items stay plain placements, because most assets have no declaration yet (ADR 0061). `ItemPlacement` remains the shape `getItems` and `itemNode` use in both modes |
| `ContainerContents` | The `bulk` arrangement: lines with quantities, no identities, no moves per line. A line becomes movable only when the host gives it a unit node |
| Decorative `count` | Decorative fill uses only positions that no tracked unit occupies, in order, so it can never overlap real units. Shelf and pallet documentation keep saying it is decoration, not inventory |
| Interaction slots | Unchanged; a receptacle names the slot group from which it is reached, so `targets` results can become agent goals |
| Behavior runner | With `handling`, the shared `HandlingState` owns the units and the runner mirrors them, so agents, UI and host see the same placements |

## Interaction design

**Move mode in the UI** (implemented in H3, [ADR 0062](decisions/0062-move-mode.md)). Move mode is optional interactivity, not a part of domain dashboards; `/examples/move-mode` is its only example. `createMoveMode` offers a unit's compatible free places, and `bindMoveMode` draws them as ghost boxes the viewer can click. Each choice reaches the host as a request with a current check; the host runs its command and calls `move`. The toolkit never moves a unit because of a click. The same targets belong in an HTML list, and `refusals` explains in text why other places are not offered.

**Agents.** An `interact` step can name a receptacle instead of an offset, or a floor placement for loads set down further away ([ADR 0067](decisions/0067-ecommerce-live-material-flow.md)): `putOn: { receptacle: 'deck' }` takes the next free position under the arrangement's access rule, and `pickUp` honours access, so a picker cannot pull the bottom carton out of a full pallet layer. A blocked exchange reports the same violation codes as UI moves.

**Drag and drop** (later, optional): pointer projection onto receptacle planes, snapping to resolved positions. It reuses `check` and the same `moveRequest` event.

## Compatibility in the object catalog

Compatibility is part of each object's contract, so the object catalog shows it before any runtime exists. A reader of `/docs/objects` should know, without building a scene, what an object fits into and what it holds.

**One source.** The catalog derives every compatibility statement from the `handling` descriptor sections and the domain profiles. Nothing is written by hand on a page, so the catalog, the descriptor check and the future runtime cannot disagree. An entry without a `handling` section says "Compatibility not declared yet" rather than implying it fits nowhere.

**Object detail page.** A new "Compatibility" section between "What this object supports" and "Use this definition":

| Block | Content |
| --- | --- |
| Handling unit | Class, family, nominal size and stacking rule, e.g. "`logistics/carton-m` · case · 0.41 × 0.34 × 0.33 m · up to 4 cases above" |
| Fits into | Every catalog receptacle that accepts this unit, grouped by object and linked to its page: "Storage shelf: `slot-0…11`", "Pallet: `deck`, patterns `carton-m-3x2`", "Worker: `carry`, up to 2" |
| Holds | Each receptacle of this object: arrangement, capacity or positions, envelope, access rule and accepted families or classes, with links to the compatible units: "`slot-3` · slot · 1 unit · 0.6 × 0.5 × 0.8 m clear · accepts case, soft-pack" |
| Load patterns | For decks: the patterns that apply, with unit count per layer and layer height |
| Domain | The profile the facts come from. With one profile in H0 the page names it; a selector that recomputes both lists arrives with the second profile (H4) |

Size limits appear next to the lists, for example "a loaded pallet higher than 1.6 m does not fit `pallet-rack` bays", so incompatibility is explained rather than just absent.

**Catalog cards and filters.** Cards gain one short tag, "Holds cases" or "Fits pallet loads", next to the existing motion tag. The toolbar gains a "Compatible with" filter: choosing `pallet` lists objects that can hold a pallet (rack, forks, pallet jack, van, container) and objects a pallet can hold (cartons, totes, drums).

**Compatibility matrix.** `/docs/handling` documents the API and lists declared units as rows and receptacles as columns, with “Fits” and its conditions, “Too large” or a dash in each cell, in a captioned HTML table with row and column headers.

**Honest labels.** Until H1 lands, the section says "Declared compatibility; moves are not checked at runtime yet". After H1 it links the runnable move example. Usage snippets show a placement only when that snippet runs.

## Inventory mapping of existing assets

First-wave mapping proposal, from the current anchors. Sizes come from current bounds; where a model is out of real scale, the class keeps the real nominal size and the open question below applies.

| Asset | Unit class | Receptacles (from existing anchors) |
| --- | --- | --- |
| `parcel` | `logistics/carton-m` (later `s`/`m`/`l` size option) | `contents` (bulk, open variant), `top` (stack) |
| `tote` | `logistics/tote` | `top` → bulk contents |
| `bag`, `poly-mailer`, `mail-sack` | `soft-pack` classes | `contents` (bulk) |
| `pallet` | `logistics/industrial-pallet` | `load` → `deck` with patterns |
| `drum-pallet`, `ibc-tank`, `bulk-bag`, `pallet-stack` | `unit-load` classes | `drum-pallet` `load` deck for drums |
| `shelf` | — | `slot-0…11` (slot, `case`/`soft-pack`, access from `pick` slots) |
| `pallet-rack` | — | `slot-0…5` (slot, `unit-load`, clear-height check) |
| `carton-flow-rack` | — | lanes as `rail` with `front` access (FIFO) |
| `store-shelving`, `put-wall`, `parcel-locker`, `hold-cage`, `pavilion` | — | slots or cells; `pavilion` from `stock-*` |
| `roll-cage`, `picking-cart`, `shopping-cart`, `hand-basket` | `wheeled` or `case` | deck or bulk |
| `pallet-jack`, `reach-truck`, `forklift` | — | `load` (stack, `unit-load`, capacity 1) |
| `truck`, `delivery-van`, `cargo-bike`, `shipping-container`, `aircraft`, `baggage-cart` | — | `load` / `cargo` decks; baggage cart as a deck. `truck` and `shipping-container` are implemented |
| `worker` and person assets | — | `carry` (stack, `case` up to `carton-m`, `soft-pack`) |
| `conveyor` | — | `rail` from `entry` to `exit`, `case`/`soft-pack` |
| `equipment-cabinet`, `rack-server`, `network-switch`, `ups-unit` | `module` classes for servers and switches | cabinet `rail` in rack units; UPS `module-*` slots |
| `lab-tray`, `lab-flask`, `lab-workstation` | `tray`, `item` | tray deck for flasks; workstation `tray` slot |
| restaurant pass, storage shelf, tables | `item`, `tray` | `slot-*`, `top` |

## Delivery plan

Small complete slices, each with JS, React and Vue parity where it adds public API.

| Phase | Scope | Acceptance |
| --- | --- | --- |
| H0 — vocabulary and declarations (implemented) | Families enum, handling-class and load-pattern types, the `logistics` profile as data, the `assetHandling` registry. Declare it for `parcel`, `tote`, `pallet`, `shelf`, `pallet-rack`, `worker`, `pallet-jack` | `checkAssetHandling` verifies anchors, unit size, envelopes and slot clearance; validation verifies patterns. The catalog shows the Compatibility section, card tags, the "Compatible with" filter and the matrix, all derived through `handlingFits` and labelled as declared, not runtime-checked. No runtime change. Done; see ADR 0058 |
| H1 — core handling state (implemented) | `createHandlingState`, `check`, `move`, `targets`, `sync`, `contents`, `path`, `nodePatches`, events, all violation codes | Unit tests for every code, mixed pallet layers, support and access rules, atomic multi-moves, sync of impossible data, container moves carrying contents, no DOM or Three.js imports. Done; see ADR 0060 |
| H2 — agents (implemented) | Carry rules as `stack` receptacles; `pickUp`/`putDown`/`putOn` through `check`; runner shares the state | `/examples/motion` unchanged visually; tests for blocked exchanges with the new codes and tick-size independence. Done; see ADR 0061 |
| H3 — move mode (implemented) | `createMoveMode`, `bindMoveMode`, `setMoveTargets`, `refusals`, HTML target list; documented at `/docs/handling` | Native React, Vue and JS sample at `/examples/move-mode` only, not in domain examples; keyboard-accessible target list; panel clicks do not pick objects behind. Done; see ADR 0062 |
| H4 — more domains (implemented) | `rail` and `bulk`, unit variants, `retail`, `datacenter` and `laboratory` profiles, 31 declared assets, a profile selector in the matrix. E-commerce stays without agents, because the scene projects confirmed records; no `restaurant` profile, because no movable restaurant model exists | Profiles add classes only. Done; see ADR 0063 |
| H5 — drag and drop | Optional pointer dragging with snapping | Same checks and events as move mode |

E2E specs are named and run only after user approval, as the repository rules require.

## Open questions

1. **Real sizes.** The single parcel is about 1.03 × 0.86 × 0.83 m at scale 1 (without the base plate since [ADR 0059](decisions/0059-one-parcel-type.md)) and examples scale it to 0.4; the bag is process-scale. H0 declares a handling scale per unit (parcel 0.4, tote 0.475) and checks the model against the class size at that scale. Still open: a typed size option per unit asset (`s`/`m`/`l`) mapped to classes.
2. **Pallet standard.** Resolved October 29: the catalog pallet was 1.4 × 1.2 m and too large for a pallet-rack position (1.3 × 1.25 m clear). It is now an industrial pallet (1.2 × 1.0 m, ISO 6780), the size of the rack's own loads and fits a rack position either way round (the 1.0 m or the 1.2 m side to the aisle). A EUR pallet (1.2 × 0.8 m) would be a separate class or a typed option when a domain needs it.
3. **Where patterns live.** In domain profiles only (proposed), or also declared by the container descriptor for its fixed geometry (for example the shelf's four slots per level)?
4. **Mass.** Left out of H1 until a domain needs load limits; then optional and host-supplied.
5. **Naming.** Settled in ADR 0060: `HandlingState`, `HandlingTarget`, `UnitPlacement` and `receptacle`.
