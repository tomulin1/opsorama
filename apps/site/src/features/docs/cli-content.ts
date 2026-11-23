import type { DocArticle } from './content';

/** The opsorama command line from @opsorama/cli: checking scene files and rendering scenes to images. */
export const cliArticle: DocArticle = {
  slug: 'api/cli', title: 'Command line', category: 'API REFERENCE',
  description: 'Check scene files without a browser and render a scene to a PNG image in headless Chromium, so people, CI jobs and coding agents can verify both the structure and the look of a scene.',
  sections: [
    { id: 'install', title: 'Install', paragraphs: [
      '@opsorama/cli provides the opsorama command for Node.js 22 or newer. It checks scene files (SceneDefinition JSON) against the scene rules and the object catalog, and renders them with the same renderer and catalog your application uses.',
      'Checking needs nothing else. Rendering runs headless Chromium through playwright-core, an optional peer dependency: install it and its browser once, or use an installed Chrome or Edge with --channel chrome or --channel msedge.',
    ], code: `npm install --save-dev @opsorama/cli
# for opsorama render:
npm install --save-dev playwright-core
npx playwright install chromium`, language: 'bash' },
    { id: 'check', title: 'Check scene files', paragraphs: [
      'opsorama check runs validateScene with assetValidator over the whole object catalog, so it reports the scene rules, unknown asset names (with the closest catalog name) and options a model does not accept. It accepts several files and prints every problem with its JSON Pointer path, rule, message and fix.',
      'Warnings (unknown-key, usually a typo) do not fail the check unless you pass --strict. A file that cannot be read or is not JSON is reported as an error.',
    ], code: `$ npx opsorama check scene.json
scene.json: 1 error, 1 warning
  error   /nodes/1  [asset-validator]  node lift
          Unknown asset: forklif. Did you mean forklift? Add its AssetFactory to the renderer's assets option, ...
          Fix: Change the node so its asset factory accepts it: ...
  warning /nodes/2/colour  [unknown-key]  node bar
          Unknown key "colour" on shape node bar; it is ignored.
          Fix: Did you mean "color"? Otherwise remove "colour".`, language: 'text' },
    { id: 'render', title: 'Render a scene to an image', paragraphs: [
      'opsorama render checks the scene first and stops on errors. Otherwise it renders the scene in headless Chromium with software WebGL and writes a PNG, by default next to the scene file (scene.json becomes scene.png). Relative image src values resolve against the scene file\'s directory.',
      'Settings such as theme, camera, zoom or labels come from a JSON file with --settings (SceneSettingsPatch). motion defaults to false, so models and routes hold still and repeated renders of the same scene match. Node labels get a default style; pass your application\'s stylesheet with --css to render them as your application does.',
      'Errors while rendering, such as a node whose model fails to build or an image that fails to load, are printed and fail the command, but the image is still written so you can see the rest of the scene.',
    ], code: `npx opsorama render scene.json -o images/scene.png --width 1280 --height 800 --scale 2
npx opsorama render scene.json --settings settings.json --css src/app.css`, language: 'bash' },
    { id: 'options', title: 'Options', headers: ['Option', 'Command', 'Meaning'], rows: [
      ['--assets <module>', 'check, render', 'A JavaScript or TypeScript module whose default export or assets export is an object of your own asset factories; they are added to the catalog.'],
      ['--json', 'check, render', 'Print the result as JSON: ok, and per file the problems; for render also out, errors and diagnostics.'],
      ['--strict', 'check', 'Fail on warnings too.'],
      ['-o, --out <file.png>', 'render', 'Image path. Default: the scene path with .png.'],
      ['--settings <file.json>', 'render', 'Scene settings (SceneSettingsPatch). motion defaults to false.'],
      ['--css <file.css>', 'render', 'A stylesheet loaded after the default label style. Repeatable.'],
      ['--width, --height <px>', 'render', 'Image size in CSS pixels, 16 to 4096. Default 1280 × 800.'],
      ['--scale <ratio>', 'render', 'Device pixel ratio, greater than 0 and at most 4. Default 1.'],
      ['--channel <name>, --executable-path <path>', 'render', 'Use an installed Chrome or Edge, or another Chromium-based browser, instead of Playwright\'s Chromium.'],
      ['--timeout <ms>', 'render', 'Time to wait for the scene to load. Default 60000.'],
    ] },
    { id: 'assets', title: 'Your own models', paragraphs: [
      'A scene that uses your own asset factories passes their module with --assets. The module may import three, @opsorama/three and @opsorama/core; the command bundles it with its own copies of these packages, so the factories and the renderer share one three.js. Its names must not repeat catalog names.',
    ], code: `// assets.ts
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';

const beacon = (node: AssetNode) => new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 16), new THREE.MeshStandardMaterial({ color: '#e0442f' }));
beacon.validate = (node: AssetNode) => { if (node.options) throw new Error('Asset beacon does not accept options.'); };
export default { beacon };

// npx opsorama check scene.json --assets assets.ts`, language: 'typescript' },
    { id: 'exit', title: 'Exit status and JSON output', paragraphs: [
      'The command exits with 0 when every file passed, 1 when a scene has errors or rendering reported errors, and 2 for a usage or tool error such as an unknown option, invalid settings or a browser that cannot start. With --json, a render result also carries diagnostics from the renderer: objects, loaded, drawCalls, geometries, textures, instanceBatches and instances.',
    ], code: `{
  "ok": true,
  "file": "scene.json",
  "out": "/work/scene.png",
  "problems": [],
  "errors": [],
  "diagnostics": { "objects": 3, "loaded": true, "drawCalls": 10, "geometries": 7, "textures": 3, "instanceBatches": 0, "instances": 0 }
}`, language: 'json' },
    { id: 'api', title: 'From code', paragraphs: [
      'The same functions are exported for scripts and tests: checkScene(input, assets?) and checkSceneFile(file, assets?) return problems, formatReport prints a report, loadAssetModule(file) loads a module of your factories and sceneRegistry(custom?) merges them with the catalog. renderScene(options) returns problems, errors, diagnostics and the PNG bytes, and run(args) runs the command in-process and returns its output and exit status.',
    ], code: `import { renderScene } from '@opsorama/cli';

const { problems, errors, png, diagnostics } = await renderScene({ scene, settings: { theme: 'midnight' }, out: 'scene.png' });`, language: 'typescript' },
    { id: 'agents', title: 'Working with coding agents', paragraphs: [
      'An agent that builds a scene can verify it on its own: run opsorama check after each change until it passes, then opsorama render and look at the image to confirm the layout, labels and colors. --json gives machine-readable output with the same paths, rules and fixes as validateScene.',
    ] },
  ],
};
