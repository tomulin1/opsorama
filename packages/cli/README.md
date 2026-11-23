# @opsorama/cli

The `opsorama` command for Opsorama 3D scenes. `opsorama check` checks scene files (`SceneDefinition` JSON) against the scene rules and the whole object catalog, without a browser. `opsorama render` renders a scene to a PNG image in headless Chromium with the same renderer and catalog your application uses. People, CI jobs and AI coding agents can verify both the structure and the look of a scene.

## Install

```sh
npm install --save-dev @opsorama/cli
# for opsorama render:
npm install --save-dev playwright-core
npx playwright install chromium
```

Node.js 22 or newer. `playwright-core` is an optional peer dependency that only `render` needs. Instead of Playwright's Chromium, `render` can use an installed Chrome or Edge with `--channel chrome` or `--channel msedge`.

## Check

```sh
npx opsorama check scene.json other-scene.json
```

Every problem is printed with its JSON Pointer path, its rule ID from `SCENE_RULES`, a message and a fix. An unknown asset name gets the closest catalog name, for example `Unknown asset: forklif. Did you mean forklift?`. Warnings (`unknown-key`, usually a typo) fail the check only with `--strict`.

## Render

```sh
npx opsorama render scene.json -o scene.png --width 1280 --height 800 --scale 2
npx opsorama render scene.json --settings settings.json --css src/app.css
```

The scene is checked first, and a scene with errors is not rendered. The image is written next to the scene file unless `-o` names a path, and relative image `src` values resolve against the scene file's directory. `--settings` takes a JSON file with scene settings (`SceneSettingsPatch`: theme, camera, zoom, labels and others). `motion` defaults to `false`, so models and routes hold still and repeated renders match. Node labels are HTML buttons (`.kit-node-label`): they get a default style, and `--css` loads your application's stylesheet after it.

Render errors are printed and fail the command, but the image is still written. Examples are a node whose model fails to build or an image that fails to load.

## Your own models

```ts
// assets.ts
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';

const beacon = (node: AssetNode) => new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 16), new THREE.MeshStandardMaterial({ color: '#e0442f' }));
beacon.validate = (node: AssetNode) => { if (node.options) throw new Error('Asset beacon does not accept options.'); };
export default { beacon };
```

```sh
npx opsorama check scene.json --assets assets.ts
npx opsorama render scene.json --assets assets.ts
```

The module's default export, or its `assets` export, is an object of asset factories. They are added to the catalog, and their names must not repeat catalog names. The module may be JavaScript or TypeScript and may import `three`, `@opsorama/three` and `@opsorama/core`. The command bundles it with its own copies of these packages, so your factories and the renderer share one three.js.

## Output and exit status

`--json` prints machine-readable results with the same paths, rules and fixes as `validateScene`. For `render`, the output also includes `out`, `errors` and the renderer's `diagnostics` (`objects`, `loaded`, `drawCalls`, `geometries`, `textures`, `instanceBatches`, `instances`).

Exit status:

- `0`: everything passed.
- `1`: a scene has errors, or rendering reported errors.
- `2`: a usage or tool error, such as an unknown option, invalid settings or a browser that cannot start.

## From code

```ts
import { checkSceneFile, formatReport, renderScene } from '@opsorama/cli';

const report = checkSceneFile('scene.json');
console.log(formatReport(report));
const { problems, errors, diagnostics } = await renderScene({ scene: { schemaVersion: 1, nodes: [] }, out: 'scene.png' });
```

The package also exports `checkScene`, `reportPassed`, `loadAssetModule`, `sceneRegistry`, and `run`. `run` runs the command in-process and returns its output and exit status.
