# Implemented object composition

Updated: October 13, 2026. This is an implemented subset of the [catalog contract](OBJECT_CATALOG.md), not the full proposed SceneGroup API.

## Contents

`ContainerContents` from `@opsorama/core` has `lines: readonly ContentLine[]`. A line contains a unique `id`, nonempty `title`, non-negative safe-integer `quantity` and optional six-digit hex `color`. Quantities count item units; repeated visual proxies do not invent unit identities. Input lines and attachment references are defensively copied/frozen in the scene store.

| Asset | Visible contents | Pose and meaning |
| --- | --- | --- |
| shopping-cart | Up to six fixed-size proxies | Cart intent; unsupported/missing contents must be labeled by the host |
| parcel | Up to nine fixed-size proxies | Single open carton; closed contents remain represented in labels/detail |

`contents.lines: []` is a known empty container. Omit `contents` for the existing decorative/count API. The host must distinguish unknown data from zero. Contents are incompatible with `count`, `multiplier` and `quantity` targets. `projectContents(contents, capacity)` returns bounded proxies, the exact total and overflow without allocating per source unit; `contentsLabel` discloses that overflow. The renderer appends this disclosure to projected labels. The host retains exact lines and provides accessible selection/detail when active labels are hidden.

## Attachments and ownership

Every scene node can declare `attachment: { nodeId: string; anchor?: string }`. Its transform is local to the parent's origin or named anchor. Nodes remain independently selectable and own their resources. Missing parents are dormant. Cycles, simultaneous `parentId`, and an attached asset's own route are errors. Building `parentId` still controls cutaway/lazy interiors; attachment descendants inherit visibility through that ancestry. Removing an owner removes descendants; rebuilding an owner detaches surviving children before disposing its geometry/materials/animators.

The renderer resolves names as `anchor-${name}` and reports a missing anchor. Do not attach to an arbitrary decorative mesh. `getAnchor(id, name)` returns the current world position/Euler rotation or null when hidden/missing/disposed. Repeated counted-object anchors are not physical unit identities; use a single-instance composition for hand/cart attachment work.

## Shared definitions and motion

Parcel supports static `closed` (compatible default) and `open` variants; open cartons have flap pivots and contents/top/front anchors. Shopping-cart has handle/contents anchors. Worker has cart/hand anchors plus pushing, finite picking and finite placing poses. The static initial pose remains useful with motion disabled. `localMotion: false` disables built-in animation; host root movement remains independent. `true` inherits scene permission and cannot override scene motion-off, pause or reduced motion. Pose changes never confirm business work.

Parcel/cart/worker inherit applicable semantic roles using theme → scene palette → compatibility `color` → instance `materials`. Product line colors remain explicit host data. `describeComposition(node)` from renderer-three constructs/disposes a temporary model and returns local bounds before instance transforms, base-origin pivot, anchors, palette roles, animation classification and instance ownership. Other assets return null until migrated. Factories and the renderer own no business source subscriptions.

## Implemented usage

```ts
import { createSceneStore } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/renderer-three';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'person', kind: 'asset', asset: 'worker', variant: 'pushing' },
  { id: 'cart', kind: 'asset', asset: 'shopping-cart',
    attachment: { nodeId: 'person', anchor: 'cart' },
    contents: { lines: [{ id: 'line-1', title: 'Goods', quantity: 9 }] } },
] });
const view = createSceneRenderer(container, store);
// On teardown: view.dispose(); store.dispose();
```

React `Asset` and native Vue `Asset` accept the same `attachment`, `contents` and `localMotion` fields. The original e-commerce recipe that demonstrated `contents` with React/Vue/JavaScript mounts was replaced in [ADR 0043](decisions/0043-ecommerce-shop-and-warehouse.md); the [new example](domains/ecommerce.md) uses `attachment` for carts, baskets and carried pallets. Source-backed update/teardown, bounded geometry, parent rebuild/removal and global motion policies require verification before extending these definitions. Complete catalog descriptors, richer generic handoffs and measured hardware performance remain outstanding.
