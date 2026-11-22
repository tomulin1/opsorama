---
name: opsorama
description: Build animated 3D operational dashboards with the Opsorama toolkit (@opsorama/core, @opsorama/three, @opsorama/objects, @opsorama/react, @opsorama/vue, @opsorama/ui). Use when a task adds or changes an Opsorama scene, chooses catalog objects or kits, maps application records to scene nodes, mounts a scene in React, Vue, Next.js or plain JavaScript, or adds dashboard panels around a 3D scene.
---

# Building dashboards with Opsorama

Opsorama draws a 3D scene of an operational space (a warehouse, shop, office, datacenter, restaurant…) inside an existing application. The **application owns** records, business rules, authentication, data sources and commands. Opsorama owns only the visual scene. Dashboards are the flagship use and what this skill covers; management games, interactive explainers and spatial visualizations are planned after the first release.

## Mental model

1. **Store** (`@opsorama/core`): `createSceneStore(definition?, settings?)` holds immutable scene nodes, settings and the selection. API: `getSnapshot`, `subscribe`, `upsert(node)`, `remove(id)`, `replace(nodes)`, `select(id | null)`, `configure(settings)`, `dispose`.
2. **Nodes**: visual records with a stable `id`. Kinds: `ground`, `zone`, `path`, `asset`, `marker`. An asset node names a catalog model in `asset` and links to an application record through `entityId`. Positions are metres, Y-up, rotations in radians. Any asset can contain other nodes: a child sets `parentId` and uses the container's local coordinates, and it shows only while the container's `view` is `'peek'` or `'open'` (default `'closed'`). Change it with `setNodeView(store, id, view)`, opt into hover peeking with `peekOnHover: true`, and load children on first opening with `bindChildren(store, id, loader)`. The `building` model is the usual container; its own options (`type`, `size`, `cutaway`, `colors`) go in `building`.
3. **Assets** (`@opsorama/objects`): model factories grouped in kits. The renderer has **no built-in models**; pass a registry.
4. **Renderer** (`@opsorama/three`): `createSceneRenderer(container, store, { assets })`, or the React/Vue `SceneCanvas`, which creates and disposes the renderer for you.

## Steps

1. **Pick the objects.** Find models by name, purpose or category in `@opsorama/objects/catalog.json` (in an installed project: `node_modules/@opsorama/objects/dist/catalog.json`; in the Opsorama repository after `pnpm build:packages`: `packages/objects/dist/catalog.json`). Each asset entry has its `kit` and a `descriptor` with palette roles, options, counts, anchors, motion and interaction. Search it; do not read the whole file.
2. **Build the registry from those kits only**:
   ```ts
   import { createAssetRegistry } from '@opsorama/three';
   import { vehiclesKit } from '@opsorama/objects/vehicles';
   import { workItemsKit } from '@opsorama/objects/work-items';
   export const assets = createAssetRegistry(vehiclesKit, workItemsKit);
   ```
   Kit subpaths: `datacenter`, `displays`, `buildings`, `indicators`, `work-items`, `people`, `furniture`, `equipment`, `office`, `retail`, `fulfillment`, `vehicles`, `environment`, `surfaces`, `energy`, `events`, `restaurant`, `aquatics`, `animals`, `farm`, `laboratory`; the export is the camel-case name plus `Kit` (`work-items` → `workItemsKit`). `@opsorama/objects/handling` is not a kit: it holds the rules for which movable unit fits which place (`createHandlingState`, `handlingItemPolicy` for the core behavior runner's `itemPolicy`, optional `createMoveMode` and `bindMoveMode`). `catalogAssets` from `@opsorama/objects` has every model; use it only for prototypes. Add custom factories as another registry; a duplicate asset name throws.
3. **Map records to nodes** in application code: one node per thing the user should see, `entityId` pointing back to the record, labels and counts derived from the record. Model-specific settings go in the node's `options`, for example `options: { measurement: { value: 72, unit: '%' } }` on a gauge, `options: { building: { type: 'warehouse' } }` or `options: { surfaceLabel: { kind: 'text', text: 'DOCK 3' } }`; the descriptor lists them as `options.<name>` customization fields, and a catalog asset throws for an option it does not accept. Create the store with `createSceneStore(definition, settings, { validateAsset: assetValidator(assets) })` (`assetValidator` from `@opsorama/three`) so `upsert` and `replace` reject invalid nodes instead of the renderer failing later. Keep totals and identities in the application; a countable model shows a bounded `count`, and a disclosed `multiplier` expresses larger totals. Never encode quantity with `scale`.
4. **Mount the scene**:
   - React: `<DashboardProvider store={store}><SceneCanvas assets={assets} style={{ height: 480 }} /></DashboardProvider>`, with declarative `Ground`, `Zone`, `Path`, `Asset`, `Marker` or `EntityLayer` children if preferred.
   - Vue: the same components from `@opsorama/vue` (`:assets="assets"`).
   - Next.js: put the scene in a `'use client'` component; the page can stay a server component.
   - Plain JavaScript: `createSceneRenderer(element, store, { assets })`.
   Complete runnable projects: `examples/vanilla`, `examples/vite-react`, `examples/vite-vue`, `examples/next` in the Opsorama repository.
5. **Update from data**: on each application change, `store.upsert(node)` or `store.replace(nodes)`. React to clicks with `onSelect` (React `SceneCanvas` prop or renderer option; Vue `@select` event) and read `selection.entityId`; run business commands in the application, then update the store.
6. **Add panels if needed**: `@opsorama/react/ui` or `@opsorama/vue/ui` (`MetricCard`, `DataPanel`, `EntityInspector`, `ResourceList`, `ValueMeter`, …) or the DOM builders in `@opsorama/ui`, with `@opsorama/ui/styles.css`. Panels only present data the application passes in. To show the selected object itself in a detail panel, add `NodePreview` (React or Vue, `nodeId` plus the same `assets`) or `createNodePreview(element, store, { assets, nodeId })` in plain JavaScript: a live, slowly turning 3D copy of the node and what it carries. Use one per panel; each owns a WebGL context.

## Lifecycle rules

- `SceneCanvas` disposes its renderer on unmount. The store belongs to your component: call `store.dispose()` when the dashboard goes away for good. In plain JavaScript dispose in reverse order: listeners, subscriptions, `renderer.dispose()`, `store.dispose()`.
- Pass a stable `assets` registry (module constant or memoized). Replacing it remounts the renderer.
- A theme or palette change (`store.configure({ theme: 'midnight' })`) rebuilds every asset node.
- The initial scene loads in slices behind a loading indicator. `onReady` fires before the first frame: `getAnchor` returns null for nodes not built yet, so await `renderer.loaded` before reading anchors. `frame(id)` called early is applied when the build finishes.
- Settings: `theme` (`light` | `midnight`), `labels`, `grid`, `shadows`, `motion`, `paused`, `speed`, `zoom` (0.65–5), `selectionStyle` (`corners` | `glow`), `palette` (semantic material overrides), `camera` (see below). Reduced-motion and motion-off always win over per-object animation.
- Camera: `store.configure({ camera: { projection: 'perspective', fov: 40 } })` (`projection`, `controls` `pan` | `none`, `fov` 20–75°, `yaw`/`pitch` in radians, `overview` `ground` | `bounds`, `frameOnSelect`); replacing `camera` resets omitted fields, so spread the current value to change one. The default is the classic orthographic overview; `zoom` is the zoom for both projections. Move the camera with `renderer.frame(id, { fit: true, transition: { seconds: 1 } })`, `renderer.overview({ transition: {} })` and `renderer.setCameraView({ yaw, pitch, target, zoom }, transition)`; each resolves `'completed'` or `'interrupted'`, and moves are cuts with reduced motion or before the first frame (await `renderer.loaded`). In React/Vue, `useSceneRenderer()` and `useCameraView()` reach the camera from any component under the provider; one provider drives one `SceneCanvas`. Orbit, follow, camera paths and touch gestures are not implemented yet.

## Common mistakes

- Calling `createSceneRenderer(container, store)` without `assets` (a type error; at runtime "Unknown asset").
- Importing `catalogAssets` in production scenes that use a few kits (much larger bundle).
- Putting business state (prices, owners, permissions) on nodes instead of in the application.
- Setting model options such as `measurement`, `surfaceLabel` or `building` directly on the node instead of inside `options`.
- Using `scale` to show quantity, or inventing unit identities for a count.
- Mounting a renderer per list item; use one scene with many nodes.
- Rendering the scene on the server in Next.js; keep it in a client component.

## Verify

- **Validate the scene first, without a browser.** Run `validateScene(definition, { validateAsset: assetValidator(assets) })` from `@opsorama/core` (with the same registry as the renderer) on every scene you write or change, for example in a unit test or a short script, and repeat until it returns `[]`. Each problem names the value by JSON Pointer `path` (`/nodes/3/route/speed` is `definition.nodes[3].route.speed`), a stable `rule` (descriptions in `SCENE_RULES`), a `message` and a `fix` that states the expected format or allowed values; `nodeId` names the node. Apply the `fix`. `severity: 'warning'` is only `unknown-key`: a key the renderer ignores, usually a typo (the fix suggests the nearest known key) or a model setting that belongs in `options`. The store's `SceneValidationError` carries the same list in `error.problems`. Editors and other tools can use the JSON Schema `@opsorama/core/scene-definition.schema.json`; it does not check IDs, parents or model options, so `validateScene` is the final check.
- Type-check, then open the page: the scene renders, selection reports the expected `entityId`, updates move nodes without remounting.
- Check that unmounting removes the canvas and that no subscriptions remain.
