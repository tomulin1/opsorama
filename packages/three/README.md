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

### Errors, load states and a lost graphics context

`onError` receives what the renderer reports instead of throwing. `createSceneRenderer` itself throws when WebGL is unavailable, the plugin list is invalid or a plugin setup fails; a renderer that fails to mount removes only the canvas, label layer and indicator it added, so fallback HTML in the container stays.

- **A node that fails to build** (its factory or `validate` throws, or its asset is not in the registry) is reported once, with a message naming the node and the original error as `cause`. The node stays as an empty placeholder: its children and attached nodes keep their place, the rest of the scene renders, and the initial load still finishes. It is built again when the node changes in more than its position or route, or when the theme or palette changes.
- **An attachment to an anchor the owner's model lacks** (`attachment.anchor`; the store cannot check model anchors) is reported once per owner build, and the node is placed at the owner's origin.
- **An image that fails to load** keeps its placeholder; the error's `name` is `IMAGE_LOAD_ERROR`.
- Listener, controller and plugin errors are reported, and the frame loop continues.

`onLoad` and `getLoadState()` report the initial load as `SceneLoadState`: `building` (with `built` of `total` visible nodes), `compiling`, then `loaded` after the first frame, when `renderer.loaded` resolves. If the browser loses the graphics context before the first frame, the load ends in the final phase `error`, `onError` receives the error and `renderer.loaded` rejects with it; a lost context later is reported to `onError` only. Either way the renderer stops drawing for good and ignores input; it does not resume when the browser restores the context. Dispose it and create a new one (in React and Vue, remount the `SceneCanvas`, for example by changing its `key`).

```ts
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry, createSceneRenderer } from '@opsorama/three';
import { vehiclesKit } from '@opsorama/objects/vehicles';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [20, 12] },
  { id: 'truck', kind: 'asset', asset: 'truck' },
  // The truck model has no `roof` anchor: reported once, and the pallet sits at the truck's origin.
  { id: 'pallet', kind: 'asset', asset: 'pallet', attachment: { nodeId: 'truck', anchor: 'roof' } },
] });
const status = document.createElement('p');
container.append(status); // stays when mounting fails
const renderer = createSceneRenderer(container, store, {
  assets: createAssetRegistry(vehiclesKit), // no `pallet` factory: that node is reported and stays empty
  onError: error => console.warn(error.message, error.cause),
  onLoad: state => { status.textContent = state.phase === 'error' ? 'Scene unavailable' : state.phase; },
});
try {
  await renderer.loaded;
} catch {
  renderer.dispose(); // the context was lost before the first frame; mount a new renderer to try again
}
```

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

### Engine hooks

Pointer events, a frame hook and plugins extend the renderer from host code:

```ts
import * as THREE from 'three';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { createAssetRegistry, createSceneRenderer, type RendererPlugin } from '@opsorama/three';
import { vehiclesKit } from '@opsorama/objects/vehicles';

const robot: AssetNode = { id: 'robot', kind: 'asset', asset: 'mobile-robot', position: [0, 0, 0] };
const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'yard', kind: 'ground', size: [20, 12] }, robot] });
// A plugin owns what it adds: it removes and disposes it in its cleanup.
const ring: RendererPlugin = {
  name: 'destination-ring',
  setup(context) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.55, .78, 48), new THREE.MeshBasicMaterial({ color: '#2f6fde' }));
    mesh.rotation.x = -Math.PI / 2; context.scene.add(mesh);
    const stop = context.onFrame(frame => mesh.scale.setScalar(1 + .1 * Math.sin(frame.time * 5)));
    return () => { stop(); mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); };
  },
};
const renderer = createSceneRenderer(container, store, {
  assets: createAssetRegistry(vehiclesKit), plugins: [ring],
  onPointer: event => {
    if (event.type !== 'click' || event.nodeId !== 'yard' || !event.point) return;
    event.preventSelection(); // keep the selection and the camera
    store.upsert({ ...robot, route: { points: [robot.position!, event.point], speed: 2.4 } });
  },
});
const stop = renderer.onFrame(frame => console.log(frame.frame, frame.time), { step: 1 / 60 });
// Later: stop(); renderer.dispose(); // runs the plugin cleanup first
```

- `onPointer` receives `down`, `up`, `click`, `enter`, `leave` and `move` (at most once per animation frame) with the nearest node under the pointer, selectable or not (grounds included), its `parentId` `ancestors` nearest first, the world `point` (on a miss, the ground plane y = 0), `pointerType`, `button`, the modifier keys and `source` (`'canvas'` or `'label'`). In a `click`, `preventSelection()` skips the default selection and framing; without it selection is unchanged. Pick targets (`setPickTargets`) take their input first.
- `onFrame(listener, { step?, maxSteps? })` runs once per rendered frame after node motion (`delta` = frame seconds × speed, 0 while paused), or with `step` (1/240–1/10 s) on a fixed simulation step before node motion: never while paused or hidden, still with motion off, at most `maxSteps` (default 4) steps per frame with the rest reported in `frame.dropped`. Listener errors go to `onError`; unsubscribing inside a listener is safe.
- `plugins` (mount-time) are set up in order after the first scene sync and cleaned up in reverse order when the renderer is disposed. The context gives `scene`, `renderer`, `container`, `store`, `camera()`, `nodeObject(id)` (read only), `loaded`, `onFrame`, `onCameraChange` and `reportError`. Duplicate names throw; a throwing setup disposes the renderer and `createSceneRenderer` throws an error naming the plugin.

### Shapes, lines and groups

Shape, line and group nodes from `@opsorama/core` are drawn without an asset registry entry. Every box, every sphere and every cylinder with the same radius ratio shares one unit geometry scaled per node, so equal shapes of any size and color draw as one instanced batch (`getDiagnostics().instanceBatches`); transparent shapes (`opacity` below 1) are never instanced. A line with `width` 0 is a 1-pixel line the pointer passes through; a wider line is a lit tube that pointer events and selection hit; `dashed` works for both. A click on a node that is not selectable selects its nearest selectable group ancestor; `selectionTarget` applies the same rule in host code, and pointer events still report the node that was hit with its groups in `ancestors`.

```ts
import { createSceneStore } from '@opsorama/core';
import { createSceneRenderer, selectionTarget } from '@opsorama/three';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [12, 8] },
  { id: 'series', kind: 'group', label: 'North', entityId: 'series:north' },
  { id: 'bar', kind: 'shape', parentId: 'series', shape: { type: 'box', size: [0.8, 3, 0.8] } },
  { id: 'link', kind: 'line', points: [[-4, 0.1, 2], [4, 0.1, 2]], width: 0.08, dashed: true },
] });
const renderer = createSceneRenderer(container, store, { assets: {}, onSelect: selection => console.log(selection?.entityId) });
const byId = new Map(store.getSnapshot().nodes.map(node => [node.id, node]));
console.log(selectionTarget('bar', id => byId.get(id))); // 'series': a click on the bar selects the group
// Later: renderer.dispose();
```

### Text and images

Text nodes are drawn into canvas textures with the system font stack of the labels (no font files), on a plane or, with `billboard`, on a sprite that faces the camera; equal text, color and alignment share one texture. Image nodes load `src` in the background with `crossOrigin = 'anonymous'` and show a neutral placeholder until it arrives; equal `src` values share one texture. A node removed or changed before its image arrives never receives it, and textures are released with the last node that uses them, so `getDiagnostics().textures` returns to its earlier count. An image that fails to load (unreachable, not an image, or from another origin without `Access-Control-Allow-Origin`) keeps its placeholder and reaches `onError` with `name` `IMAGE_LOAD_ERROR` and a message naming the node and the URL. Text and images are transparent: never instanced, no shadows, not covered by the glow selection style. Pointer events and selection hit them, billboards included. Canvas text is not accessible text.

```ts
import { createSceneStore } from '@opsorama/core';
import { createSceneRenderer, IMAGE_LOAD_ERROR } from '@opsorama/three';

const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [12, 8] },
  { id: 'sign', kind: 'text', text: 'Dock 4\nInbound', position: [0, 0, -2], size: 0.5 },
  { id: 'logo', kind: 'image', src: '/images/logo.png', size: [1.5, 1.5], position: [3, 0, 0], billboard: true, selectable: true },
] });
const renderer = createSceneRenderer(container, store, {
  assets: {},
  onError: error => { if (error.name === IMAGE_LOAD_ERROR) console.warn(error.message); },
});
// Later: renderer.dispose(); // releases every text and image texture
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
