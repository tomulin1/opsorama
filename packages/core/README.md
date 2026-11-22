# @opsorama/core

Framework-free scene model for Opsorama 3D scenes and dashboards: typed nodes (ground, zone, path, asset, marker), scene validation with located problems and a JSON Schema, immutable snapshots, validated settings, selection and subscriptions, plus containment, movement graphs, routes, interaction slots, behaviors with carried items and a generic item policy hook. No DOM, Three.js, React or Vue imports, so it runs anywhere, including servers and tests.

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

Nodes are visual records only; your application keeps business data and links nodes to it through `entityId`. Model-specific settings go in an asset node's `options` (`AssetOptions`): core accepts any plain JSON-like object and freezes it, model packages such as `@opsorama/objects` type and validate their options, and `createSceneStore(definition, settings, { validateAsset })` can reject invalid asset nodes before the store accepts them. Render the store with `@opsorama/three` directly or through `@opsorama/react` / `@opsorama/vue`.

## Validate a scene

`validateScene(input, options?)` checks a scene definition, such as parsed JSON or a file an agent wrote, and returns every problem in one pass instead of throwing at the first. Each problem has a JSON Pointer `path`, a stable `rule` ID (listed with descriptions in `SCENE_RULES`), a `severity`, a `message`, an actionable `fix` and the `nodeId`. An empty array means the store accepts the scene; `unknown-key` warnings (usually typos) do not block it.

```ts
import { validateScene, type SceneDefinition } from '@opsorama/core';

const input: unknown = JSON.parse('{ "schemaVersion": 1, "nodes": [{ "id": "floor", "kind": "ground", "size": [20, 0] }] }');
const problems = validateScene(input);
// [{ path: '/nodes/0/size', rule: 'size', severity: 'error', message: 'Invalid size for floor.',
//    fix: 'Set size to [width, depth] in metres, both greater than 0 (received [20,0]).', nodeId: 'floor' }]
for (const problem of problems) console.warn(`${problem.severity} ${problem.path} [${problem.rule}] ${problem.message} Fix: ${problem.fix}`);
if (!problems.some(problem => problem.severity === 'error')) console.log((input as SceneDefinition).nodes.length);
```

Pass `{ validateAsset: assetValidator(registry) }` (from `@opsorama/three`) to also check asset names and model options. `createSceneStore`, `replace`, `upsert` and `validateNode` run the same checks and throw `SceneValidationError`, whose `message` is the first error and whose `problems` lists them all.

The JSON Schema of a scene definition ships as `@opsorama/core/scene-definition.schema.json` (draft-07, generated from these types, for editors and JSON Schema validators). It checks structure, types and ranges; rules across nodes (unique IDs, parents, attachments) and model options are checked by `validateScene` only.

## Camera settings

`SceneSettings.camera` (`CameraSettings`) configures the camera: `projection` (`'orthographic'`, the default, or `'perspective'`), `controls` (`'pan'`, `'orbit'` or `'none'`), `fov` (degrees 20–75, perspective only), `yaw` and `pitch` (overview direction in radians), `overview` (`'ground'` or `'bounds'`) and `frameOnSelect`. The defaults reproduce the classic orthographic overview from the offset [16, 22, 30]. Replacing `camera` resets omitted fields to `DEFAULT_CAMERA_SETTINGS`, like `palette`; spread the current value to change one field. `SceneSettings.zoom` stays the single zoom for both projections.

```ts
import { createSceneStore } from '@opsorama/core';

const store = createSceneStore(undefined, { camera: { projection: 'perspective', fov: 40 } });
store.configure({ camera: { ...store.getSnapshot().settings.camera, yaw: Math.PI / 2 } });
```

`CameraView` and `CameraTransition` describe what the renderer's camera API in `@opsorama/three` reads and sets; `validateCameraView` and `validateCameraTransition` check them with actionable errors. `CameraFollowOptions` (`distance` in metres, `heading` `'fixed'` or `'behind'`) configure `renderer.followNode`, checked by `validateCameraFollow`.

A `CameraPath` is a list of 1–64 `CameraKeyframe`s for `renderer.playCameraPath`: each gives a `view`, a node to `frame` or both, the travel time in `seconds` (0–60, 0 is a cut), an optional `hold` and `easing`, and the path may `loop`. Paths are host data for the renderer, not part of a scene definition. `validateCameraPath` throws an error that names the JSON Pointer of the offending value and the fix:

```ts
import { validateCameraPath, type CameraPath } from '@opsorama/core';

const tour: CameraPath = { keyframes: [
  { frame: { nodeId: 'dock', fit: true }, view: { yaw: -0.6 }, seconds: 1.5, hold: 0.5 },
  { view: { target: [0, 0, 0], zoom: 1 }, seconds: 1.5, easing: 'linear' },
], loop: true };
validateCameraPath(tour);
try { validateCameraPath({ keyframes: [{ view: { yaw: 0 }, seconds: 90 }] }); }
catch (error) { console.log((error as Error).message); } // Camera path /keyframes/0/seconds: set the travel time in seconds from 0 to 60; 0 is a cut.
```

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.
