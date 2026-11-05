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
- `three` is a peer dependency.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
