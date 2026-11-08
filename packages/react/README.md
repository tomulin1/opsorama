# @opsorama/react

Native React adapter for Opsorama: `DashboardProvider`, `SceneCanvas`, hooks (`useScene`, `useSceneStore`, `useSceneZoom`, `useRendererFps`) and declarative scene components (`Ground`, `Zone`, `Path`, `Asset`, `Marker`, `EntityLayer`) and a headless `EntityInspector`. `@opsorama/react/ui` adds the panel components. Works in client components of Next.js and other React frameworks.

## Install

```sh
npm install @opsorama/react @opsorama/core @opsorama/three @opsorama/objects three react
```

## Usage

```tsx
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { DashboardProvider, SceneCanvas, Ground, Asset } from '@opsorama/react';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore();

export function Dashboard() {
  return (
    <DashboardProvider store={store}>
      <SceneCanvas assets={assets} style={{ height: 420 }}>
        <Ground id="floor" size={[20, 12]} />
        <Asset id="order-1" entityId="1" asset="parcel" label="#1" position={[0, 0.08, 1]} />
      </SceneCanvas>
    </DashboardProvider>
  );
}
```

`SceneCanvas` creates the renderer on mount and disposes it on unmount; the store belongs to your component. Pass a stable `assets` registry: replacing it remounts the renderer.

Until the first frame `SceneCanvas` shows a loading indicator, also in server-rendered HTML. Replace its content with `loading={state => ...}` or turn it off with `loading={false}`; `onLoad` reports progress.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
