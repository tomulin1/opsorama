# Opsorama

**A clear view of your operations.**

![Opsorama — a clear view of your operations](apps/site/public/brand/opsorama-lockup.svg)

Opsorama (pronounced "ops-oh-RAH-ma", operations + panorama) is an open-source toolkit for animated 3D dashboards inside existing admin interfaces: warehouses, shops, offices, datacenters, restaurants and other operational spaces. It has native **React** and **Vue** adapters and works with **plain JavaScript**. Your application keeps its data, rules and commands; Opsorama draws the scene.

- **160 procedural models** in 21 kits (vehicles, work items, furniture, datacenter, restaurant, …), with typed options, semantic palettes, static poses and documented anchors. No downloaded models or textures.
- **One renderer** for every framework, with selection, labels, markers, camera control, motion, instancing and explicit disposal.
- **Optional HTML panels** for metrics, inspectors and lists that you can replace with your own UI.
- **Made for AI coding agents**: typed contracts, a machine-readable object catalog (`@opsorama/objects/catalog.json`) and an agent skill in [`skills/opsorama`](skills/opsorama).

> **Status: pre-release.** The packages are not published on npm yet, and the API can change before 1.0. See the [roadmap](docs/ROADMAP.md).

## Quick start

```sh
npm install @opsorama/core @opsorama/three @opsorama/objects @opsorama/react three react
```

The renderer ships no models. Pass the kits your scene uses:

```tsx
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { DashboardProvider, SceneCanvas, Ground, Zone, Asset } from '@opsorama/react';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore();

export function Dashboard() {
  return (
    <DashboardProvider store={store}>
      <SceneCanvas assets={assets} style={{ height: 420 }}>
        <Ground id="floor" size={[20, 12]} />
        <Zone id="packing" size={[7, 7]} color="#e4ecff" label="PACKING" />
        <Asset id="order-1" entityId="1" asset="parcel" label="#1" position={[0, 0.08, 1]} />
      </SceneCanvas>
    </DashboardProvider>
  );
}
```

<details>
<summary>Vue</summary>

```vue
<script setup lang="ts">
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { DashboardProvider, SceneCanvas, Ground, Zone, Asset } from '@opsorama/vue';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore();
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="assets" style="height: 420px">
      <Ground id="floor" :size="[20, 12]" />
      <Zone id="packing" :size="[7, 7]" color="#e4ecff" label="PACKING" />
      <Asset id="order-1" entity-id="1" asset="parcel" label="#1" :position="[0, 0.08, 1]" />
    </SceneCanvas>
  </DashboardProvider>
</template>
```

</details>

<details>
<summary>Plain JavaScript</summary>

```ts
import { createSceneStore } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'packing', kind: 'zone', size: [7, 7], color: '#e4ecff', label: 'PACKING' },
  { id: 'order-1', entityId: '1', kind: 'asset', asset: 'parcel', label: '#1', position: [0, 0.08, 1] },
] });
const renderer = createSceneRenderer(document.querySelector<HTMLElement>('#scene')!, store, { assets: workItemsKit });

// When the view goes away:
renderer.dispose();
store.dispose();
```

</details>

Complete projects for plain TypeScript, Vite + React, Vite + Vue and Next.js are in [`examples/`](examples).

## Packages

| Package | Purpose |
| --- | --- |
| `@opsorama/core` | Framework-free scene model: nodes, settings, selection, subscriptions, movement and handling rules. No DOM or graphics. |
| `@opsorama/three` | The Three.js renderer: camera, selection, labels, markers, motion playback, instancing and disposal. Ships no models. |
| `@opsorama/objects` | The object catalog: 21 kits on subpaths such as `@opsorama/objects/vehicles`, `catalogAssets` with every model, descriptors and `catalog.json`. |
| `@opsorama/react` | Native React adapter: `DashboardProvider`, `SceneCanvas`, hooks and scene components. `@opsorama/react/ui` adds panels. |
| `@opsorama/vue` | Native Vue adapter with the same contract (no React runtime). `@opsorama/vue/ui` adds panels. |
| `@opsorama/ui` | Optional framework-neutral panel builders, a DOM mount and scoped CSS. |

All packages are ESM-only, ship TypeScript declarations and declare `"sideEffects": false` (the UI stylesheet excepted). `three` is a peer dependency.

## Documentation

- The documentation website (run `pnpm dev`, then open http://127.0.0.1:3100/docs) has the API reference, guides, a live playground and the object browser at `/docs/objects`, where each object page shows its kit, options and usage snippets.
- [Architecture](docs/ARCHITECTURE.md), [project vision](docs/PROJECT_VISION.md) and [roadmap](docs/ROADMAP.md).
- Guides: [panels](docs/DATA_PANELS.md), [indicators](docs/INDICATORS.md), [object labels](docs/OBJECT_LABELS.md), [object composition](docs/OBJECT_COMPOSITION.md), [bounded counts](docs/QUANTITY_SCALING.md), [handling units](docs/CONTAINMENT.md), [performance playground](docs/PERFORMANCE_PLAYGROUND.md), [brand](docs/BRAND.md).
- Domain notes: [e-commerce](docs/domains/ecommerce.md), [office](docs/domains/office.md), [datacenter](docs/domains/datacenter.md).

## Browser support

Opsorama needs WebGL. It is developed and tested in Chromium-based browsers (including Playwright with software WebGL). Firefox and Safari have not been verified yet; reports are welcome.

## Development

Requires Node.js 22+ and pnpm 11+.

```sh
pnpm install
pnpm dev          # website at http://127.0.0.1:3100
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Package builds and their checks:

```sh
pnpm build:packages
pnpm check:packages
pnpm check:bundles
pnpm smoke:starters
```

End-to-end tests (slow): `pnpm --filter @opsorama/site exec playwright install chromium`, then `pnpm test:e2e`. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute, [AGENTS.md](AGENTS.md) for the rules every contributor and AI agent follows, and [the object guide](docs/CONTRIBUTING_OBJECTS.md) for catalog objects. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), copyright 2026 Tomas Jirsa. This covers the source code, procedural models, documentation and supplied SVG assets unless identified otherwise; third-party material keeps its own license; see [third-party notices](THIRD_PARTY_NOTICES.md). A "Powered by Opsorama" credit is welcome but optional.

Contact: [contact@opsorama.dev](mailto:contact@opsorama.dev) · [GitHub](https://github.com/tomulin1/opsorama)
