# Bounded object counts and symbolic quantities

Status: **implemented count configurators; common palette/anchor contract remains planned**. Updated October 13, 2026. This replaces the general adaptive-scaling proposal as the primary quantity design. [ADR 0006](decisions/0006-bounded-object-counts.md) records the decision. Configurators: `/docs/objects`. The dedicated Quantities website section was removed on October 13 at the user’s request; implementers calculate symbolic scale and choose any multiplier themselves.

## Principle

Every countable model declares its own finite integer range or exact count variants. Count changes the visible composition. A disclosed multiplier changes its symbolic meaning without increasing geometry. Other models have no count configurator. Geometric transform scale remains available for host placement, but the catalog's general Scale slider is removed; it is not a quantity encoding.

**Represented quantity = visible count × multiplier.** The host owns source totals, units, business meaning and commands. A composition is one selectable scene node; its visible parts are not invented physical identities.

The implementer determines the multiplier or any other symbolic mapping. The toolkit does not prescribe a business scale or provide a dedicated multiplier configurator in the documentation site. Finite model count controls remain part of object customization.

## Implemented scope

| Model | Count definition | Default | Composition |
| --- | --- | --- | --- |
| `parcel-base` | Every integer 0–27 | 1 | Parcels on a grey base plate: three columns × three rows × three layers; compact or reserved slots; zero leaves the empty base |
| `pallet` | Every integer 0–27 | 9 | Fixed 1.2 × 1.0 m industrial wood base; three columns × three rows × three layers of smaller boxes; zero leaves the empty pallet |
| `shelf` | Every integer 0–12 | 12 | Four boxes per shelf × three levels; zero produces an empty rack |

The single `parcel` has no count: it is exactly one carton, and `parcel-base` and `pallet` show counted parcels with the same geometry ([ADR 0059](decisions/0059-one-parcel-type.md), which also removed the `quantity-stack` block proxy and the `quantity-box` unit box).

The core exports `AssetCountDefinition`, `AssetCountInput`, `CountRepresentation`, `resolveCountRepresentation` and `validateCountInput`. `AssetNode` adds optional `count` and `multiplier`. Renderer-three exports `assetCountDefinitions`; each supported factory enforces its declared values. React and native Vue Asset props use the same numbers; Vue does not embed React.

Catalog detail pages show only a visible-count slider or exact-variant select and matching usage snippets. The host owns multiplier inputs, symbolic totals and their calculation; the API retains multiplier support for host applications. Counts reset to factory defaults. Invalid input retains the last valid preview and reports why. Counted previews fit against maximum declared capacity, so one part is never enlarged to fill the viewer. Viewer normalization stays out of exported usage. The catalog retains isolated model previews; shared native adapter fixtures remain available for host-owned examples.

## Reserved space and stacking

[ADR 0010](decisions/0010-reserved-count-layouts.md) adds optional typed AssetNode.countLayout (compact or reserved), now for `parcel-base` only ([ADR 0059](decisions/0059-one-parcel-type.md)). Reserved mode allocates maximum-capacity slots from the first visible part; increasing count keeps existing part positions and dimensions. Parcels fill rows, then layers. The reserved base plate keeps its full footprint, also when empty; an empty compact base keeps the one-parcel plate. Desk pods and meeting tables retain their compact arrangements without a count-layout option. Counts still mean the model-specific unit, not boxes on office furniture.

The catalog defaults these models to Reserve full capacity and exposes Compact layout as an alternative. Host scenes without countLayout retain their existing compact defaults. Shelves, totes, carts, lockers, cabinets and other fixed containers/indicators already use fixed part dimensions/slots and need no new selector. All counted previews now use capacity-based fitting, including zero occupancy. The pallet always uses fixed slots and its wooden base never contracts; it has no compact-layout option. This is optional geometry layout, not a quantity multiplier or source identity change.

The pallet has an isolated catalog preview and appears in `/examples/logistics` through native React, Vue and JavaScript. Pallet geometry reuses the shared parcel geometry (`parcelPart`) and the warehouse prototype's wooden slat/block construction, with a base-centered pivot, load/front anchors, body color/state overrides and repeated optional surface labels. Wood/tape colors are fixed; the full semantic palette and common object descriptor remain C1 work.

## Laboratory summaries

The shared lab-tray and lab-workstation count 0–9 fixed-size flasks in nine reserved positions. Workstations count flasks, not workers. A host may supply a disclosed multiplier while preserving exact source totals and identities; the models infer no file, branch or workflow membership. Their isolated catalog previews and JS/React/Vue usage snippets remain available after removal of the DevOps recipe.

## Types and validation

```ts
// Implemented shape; imports are from @opsorama/core.
type AssetCountDefinition = Readonly<{
  label: string;
  unit: string;
  default: number;
} & (
  | { kind: 'range'; min: number; max: number; step: number }
  | { kind: 'variants'; values: readonly number[] }
)>;

// Inside a host-owned scene:
const node = {
  id: 'stock-group', kind: 'asset' as const, asset: 'parcel',
  count: 27, multiplier: 1000, countLayout: 'reserved',
  label: '27,000 parcels · 27 × 1,000', selectable: true,
};
```

Count is a non-negative safe integer, subject to the model's range/list. Multiplier is a positive safe integer, default 1; their product must also be safe. Fractional counts, invalid variants and overflow are errors, with no silent clipping or rounding. Omitted count retains the factory default. Zero is supported only where explicitly declared; a zero-parcel source should omit that composition or use a host empty state.

## Worked example: 12,347 boxes of one SKU

A host can decompose an exact total into bounded compositions without a general camera-density policy:

| Visible parts | Multiplier | Represented quantity |
| --- | --- | --- |
| 12 | 1,000 | 12,000 |
| 3 | 100 | 300 |
| 4 | 10 | 40 |
| 7 | 1 | 7 |
| **26** | Explicit per composition | **12,347** |

All four counts are valid for Parcel; a single Parcel with count 1 and multiplier 12,347 can also symbolize the same total. Neither presentation creates individual unit records. Hosts choose their useful shape and disclose the conversion. If they choose a rounded approximation, label it as approximate and keep the actual source total visible. One positive safe-integer source total can always use count 1 with that total as its multiplier.

## Source truth and exact units

Counted model geometry and real source membership are separate. The former QuantityLayer exact unit API was removed on November 3, 2026 by [ADR 0076](decisions/0076-remove-exact-unit-api.md): hosts keep source membership and exact totals in their own records and code. The old general scaling roadmap is no longer the primary design.

When a node stands for a source group, the host keeps count × multiplier equal to the group quantity; the toolkit no longer checks this. A node for a real unit represents exactly one unit. Source groups remain authoritative, and never select an arbitrary child record. A catalog preview has no stock source and must not claim real inventory.

## Smallest implementation slice and acceptance

- Validate range boundaries, discrete variants, zero where supported, fractional/unsafe values, defaults and multiplier overflow.
- Verify Parcel layouts at 1, 3, 9, 10, 18 and 27; each slot is unique and each axis has at most three positions.
- Verify empty/full shelves and all four stack variants. Multiplier changes preserve bounds and geometry cost.
- Keep one owner/selection identity during updates; preserve real/group quantity contracts.
- Verify count and multiplier props through native React, Vue and JavaScript, plus update/unmount/remount and resource disposal.
- Verify keyboard sliders, exact variant selects, invalid input, reset, snippets and responsive catalog/detail layouts.

This is bounded procedural geometry, not GPU instancing or a hardware performance claim. Subsequent catalog objects must declare equally explicit count support or omit the controls.
