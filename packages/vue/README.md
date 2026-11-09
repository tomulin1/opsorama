# @opsorama/vue

Native Vue 3 adapter for Opsorama with the same scene contract as the React adapter and no React runtime: `DashboardProvider`, `SceneCanvas`, composables (`useScene`, `useSceneStore`, `useSceneZoom`, `useRendererFps`), scene components (`Ground`, `Zone`, `Path`, `Asset`, `Marker`, `EntityLayer`) and a headless `EntityInspector`. `@opsorama/vue/ui` adds the panel components.

## Install

```sh
npm install @opsorama/vue @opsorama/core @opsorama/three @opsorama/objects three vue
```

## Usage

```vue
<script setup lang="ts">
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { DashboardProvider, SceneCanvas, Ground, Asset } from '@opsorama/vue';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore();
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="assets" style="height: 420px">
      <Ground id="floor" :size="[20, 12]" />
      <Asset id="order-1" entity-id="1" asset="parcel" label="#1" :position="[0, 0.08, 1]" />
    </SceneCanvas>
  </DashboardProvider>
</template>
```

`SceneCanvas` creates the renderer on mount and disposes it on unmount; the store belongs to your component.

Until the first frame `SceneCanvas` shows a loading indicator. The `loading` slot (given `{ state }`) replaces its content, `:loading="false"` turns it off, and `@load` reports progress.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
