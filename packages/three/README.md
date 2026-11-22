# @opsorama/three

The Opsorama renderer: one Three.js scene renderer for every framework, with orthographic and perspective cameras, timed camera transitions, orbit, following a node, camera paths, framing, panning and wheel zoom, labels and markers, selection styles, motion playback, shadows, static merging, instancing and explicit disposal. It ships **no models**: you pass an asset registry, usually kits from `@opsorama/objects`.

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
- An `AssetFactory` may carry `validate(node)`, which checks the node (for example its `options`) without building it; the renderer calls it before building. `createSceneStore(definition, settings, { validateAsset: assetValidator(assets) })` runs the same checks, plus unknown asset names, before the store accepts a node.
- Factories can set `userData.labelHeight`, `userData.labelText` and `userData.labelWrap` for the floating label, and `userData.containerBounds` for hover peeking; the renderer reads no model-specific node fields.
- `disposeObject` releases a model; `addObjectRelease` registers extra cleanup (image requests, object URLs) for custom factories.
- Large scenes load in slices of `buildBudget` milliseconds (default 12) with a loading indicator over the scene until the first frame. `onLoad` reports progress, `renderer.loaded` resolves after the first frame, and `loadingIndicator: false` hides the built-in indicator.
- `three` is a peer dependency.

### Camera

The camera follows `SceneSettings.camera` (projection, controls, field of view, overview direction; see `@opsorama/core`) and `SceneSettings.zoom`. The renderer reads and moves it:

```ts
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry, createSceneRenderer } from '@opsorama/three';
import { vehiclesKit } from '@opsorama/objects/vehicles';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'truck', kind: 'asset', asset: 'truck', position: [-3, 0, 0] },
] }, { camera: { projection: 'perspective' } });
const renderer = createSceneRenderer(container, store, { assets: createAssetRegistry(vehiclesKit) });
const stop = renderer.onCameraChange(view => console.log(view.target, view.yaw, view.pitch, view.zoom));
await renderer.loaded;
const result = await renderer.frame('truck', { fit: true, transition: { seconds: 1 } });
if (result === 'completed') await renderer.setCameraView({ yaw: Math.PI / 4 }, { seconds: 0.8, easing: 'linear' });
await renderer.overview({ transition: {} });

// Orbit with a right drag or Ctrl + drag, keep the camera behind the truck, then play a path (which ends the follow).
store.configure({ camera: { ...store.getSnapshot().settings.camera, controls: 'orbit' } });
const following = renderer.followNode('truck', { heading: 'behind', distance: 15 });
const tour = renderer.playCameraPath({ keyframes: [
  { frame: { nodeId: 'truck', fit: true }, view: { yaw: Math.PI / 2 }, seconds: 1.5, hold: 1 },
  { view: { target: [0, 0, 0], yaw: 0.49, zoom: 1 }, seconds: 1.5, easing: 'linear' },
] });
console.log(await following, await tour.finished); // 'interrupted', then 'completed' (or 'interrupted' after tour.stop())
stop();
```

- `getCameraView()` returns the drawn view (`target`, `yaw`, `pitch`, `zoom`); `setCameraView(view, transition?)` moves it (omitted fields stay; a cut without a transition) and writes a changed zoom to the store when the camera arrives.
- `frame(id, { fit?, transition? })` and `overview({ transition? })` move on the transition's timing when given one and behave as before without. Every move resolves `'completed'` or `'interrupted'`.
- Transitions run on real time. Reduced motion, `motion: false` and the initial load make them cuts; a drag, another move, clearing the selection or a zoom change from elsewhere interrupts them.
- `onCameraChange` calls its listener at most once per rendered frame while the view changes. Labels behind the perspective camera are hidden.
- With `controls: 'orbit'`, a right-button drag or a Ctrl + primary-button drag turns the view around its target (yaw, and pitch within 0.05–1.55); a primary drag still pans and the context menu is suppressed only while orbit is set. Pens behave like a mouse. The canvas takes no keyboard focus, so give keyboard users host controls that call `setCameraView`.
- Touch stays with the page by default (no `touch-action` on the canvas; a tap selects). The mount-time option `touchGestures: true` sets `touch-action: none` (restored on dispose): one finger pans, two fingers pinch-zoom `SceneSettings.zoom` around their midpoint (written at most once per animation frame, within `ZOOM_RANGE`), and with `controls: 'orbit'` a two-finger twist turns the yaw and a two-finger vertical drag the pitch. A touch that moves less than 5 px still selects; a gesture interrupts transitions and paths like a drag, a one-finger pan ends following, and a pinch while following zooms around the followed node.
- `followNode(id | null, { distance?, heading? })` keeps the target on a node every frame (routes, controllers and carriers included); `heading: 'behind'` also turns the yaw, smoothed, behind the node. A pan or another camera move ends it (`'interrupted'`), an orbit keeps it, removing or hiding the node ends it (`'removed'`), and `followNode(null)` ends it (`'stopped'`); the promise resolves with that reason. `getFollowedNode()` returns the followed ID.
- `playCameraPath(path)` plays `CameraKeyframe`s (a view and/or a framed node, travel `seconds`, `hold`, `easing`, `loop`) on real seconds and returns `{ stop(), finished }`. Reduced motion and `motion: false` cut to each keyframe at its time; a drag, `frame`, `overview`, `setCameraView`, `followNode`, an outside zoom change or a new path interrupts it.

```ts
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry, createSceneRenderer } from '@opsorama/three';
import { vehiclesKit } from '@opsorama/objects/vehicles';

const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'floor', kind: 'ground', size: [20, 12] }] }, { camera: { controls: 'orbit' } });
// A full-viewport scene takes touch from the page; embedded scenes usually leave it off.
const renderer = createSceneRenderer(container, store, { assets: createAssetRegistry(vehiclesKit), touchGestures: true, wheelZoom: true });
```

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
- The copy contains the node and its visible descendants: attached nodes, and the children of an open container such as a building (`previewNodes` lists them; at most `maxNodes`, default 240). Markers have no geometry and show nothing. Routes, controllers and transfers are left out, so nothing travels.
- The copy turns slowly (`spin`, default 0.4 rad/s, 0 to keep it still); dragging horizontally or the left and right arrow keys turn it by hand. It never selects or changes the store.
- The canvas is transparent and draws only while something moves. Each preview owns one WebGL context: use one per panel, not one per list row.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
