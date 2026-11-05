# @opsorama/core

Framework-free scene model for Opsorama 3D dashboards: typed nodes (ground, zone, path, asset, marker), immutable snapshots, validated settings, selection and subscriptions, plus movement graphs, routes, interaction slots, behaviors and handling rules. No DOM, Three.js, React or Vue imports, so it runs anywhere, including servers and tests.

## Install

```sh
npm install @opsorama/core
```

## Usage

```ts
import { createSceneStore } from '@opsorama/core';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'order-1', entityId: '1', kind: 'asset', asset: 'parcel', label: '#1', position: [0, 0.08, 1] },
] });
const unsubscribe = store.subscribe(() => console.log(store.getSnapshot().selection));
store.select('order-1');
unsubscribe();
store.dispose();
```

Nodes are visual records only; your application keeps business data and links nodes to it through `entityId`. Render the store with `@opsorama/three` directly or through `@opsorama/react` / `@opsorama/vue`.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
