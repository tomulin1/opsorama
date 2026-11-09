# @opsorama/three

The Opsorama renderer: one Three.js scene renderer for every framework, with camera framing, panning and wheel zoom, labels and markers, selection styles, motion playback, shadows, static merging, instancing and explicit disposal. It ships **no models**: you pass an asset registry, usually kits from `@opsorama/objects`.

## Install

```sh
npm install @opsorama/three @opsorama/core @opsorama/objects three
```

## Usage

```ts
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry, createSceneRenderer } from '@opsorama/three';
import { vehiclesKit } from '@opsorama/objects/vehicles';
import { workItemsKit } from '@opsorama/objects/work-items';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'truck', kind: 'asset', asset: 'truck', position: [-3, 0, 0] },
  { id: 'pallet', kind: 'asset', asset: 'pallet', count: 12, position: [3, 0, 0] },
] });
const renderer = createSceneRenderer(container, store, { assets: createAssetRegistry(vehiclesKit, workItemsKit) });
// Later: renderer.dispose(); store.dispose();
```

- `assets` is required. `createAssetRegistry` merges registries and rejects a duplicate asset name, so your own factories never silently replace catalog models.
- `disposeObject` releases a model; `addObjectRelease` registers extra cleanup (image requests, object URLs) for custom factories.
- Large scenes load in slices of `buildBudget` milliseconds (default 12) with a loading indicator over the scene until the first frame. `onLoad` reports progress, `renderer.loaded` resolves after the first frame, and `loadingIndicator: false` hides the built-in indicator.
- `three` is a peer dependency.

### Node preview

`createNodePreview` shows a live copy of one scene node in its own small canvas, for an inspector or detail panel:

```ts
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry, createNodePreview } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'pallet', kind: 'asset', asset: 'pallet', count: 12 }] });
const preview = createNodePreview(container, store, { assets, nodeId: 'pallet' });
store.subscribe(() => preview.setNode(store.getSnapshot().selection?.nodeId ?? null));
// Later: preview.dispose();
```

- It reads the scene's store, so state, count, material, theme and palette changes rebuild the copy, and model animation follows the scene's motion, pause, speed and reduced-motion settings.
- The copy contains the node and its visible descendants: attached nodes, and the interior of an open building (`previewNodes` lists them; at most `maxNodes`, default 240). Markers have no geometry and show nothing. Routes, controllers and transfers are left out, so nothing travels.
- The copy turns slowly (`spin`, default 0.4 rad/s, 0 to keep it still); dragging horizontally or the left and right arrow keys turn it by hand. It never selects or changes the store.
- The canvas is transparent and draws only while something moves. Each preview owns one WebGL context: use one per panel, not one per list row.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
