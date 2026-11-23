import type { DocArticle } from './content';

/** glTF models: gltfAsset from @opsorama/three/gltf, sharing, instancing, loading, animation, custom loaders and provenance. */
export const modelsArticle: DocArticle = {
  slug: 'models', title: 'glTF models', category: 'FOUNDATIONS',
  description: 'Place your own glTF and GLB models next to catalog models: gltfAsset turns a file into an asset factory that loads once, shares its geometry, materials and textures between nodes, renders repeated parts as instanced batches, plays an animation clip and releases everything with the last node.',
  sections: [
    { id: 'load', title: 'Register a model', paragraphs: [
      'gltfAsset(url, options?) from @opsorama/three/gltf returns an asset factory for a .gltf or .glb file. Register it under an asset name next to catalog kits with createAssetRegistry, then use that name in asset nodes like any catalog model. The subpath keeps the glTF loader out of scenes that do not use it.',
      'The model is normalized once: rotation turns it so it stands on +y and faces +z, height scales it uniformly to a height in metres (or scale by a factor), and the default pivot base-center moves it so the centre of its base is the node position, like the catalog models. Node position, rotation and scale apply on top. The floating label sits 0.25 m above the model unless labelHeight says otherwise.',
    ], code: `import { createAssetRegistry, createSceneRenderer } from '@opsorama/three';
import { gltfAsset } from '@opsorama/three/gltf';
import { furnitureKit } from '@opsorama/objects/furniture';

const assets = createAssetRegistry(furnitureKit, {
  drone: gltfAsset('/models/drone.glb', { height: 0.7 }),
});
store.upsert({ id: 'drone-1', kind: 'asset', asset: 'drone', entityId: 'drone:1', position: [2, 0, 1] });
const renderer = createSceneRenderer(container, store, { assets, onError: error => console.warn(error.message) });`, language: 'typescript' },
    { id: 'options', title: 'Options', headers: ['Option', 'Default', 'Meaning'], rows: [
      ['height', 'none', 'Height in metres; the model is scaled uniformly to it. Without height or scale, the file\'s units are metres.'],
      ['scale', '1', 'Uniform scale instead of height.'],
      ['rotation', '[0, 0, 0]', 'Turn the model (radians, XYZ) before it is measured, so it faces +z.'],
      ['pivot', "'base-center'", "'model-origin' keeps the file's origin as the node position."],
      ['shadows', 'true', 'Cast and receive shadows.'],
      ['animation', 'none', 'Name of a clip to play in a loop while scene motion is on, or true for the first clip.'],
      ['placeholder', '[1, 1, 1]', 'Size of the translucent box shown until the file has loaded, or false.'],
      ['labelHeight', 'model top + 0.25', 'Height of the floating label in metres.'],
      ['loader', 'GLTFLoader', 'Any object with loadAsync(url), such as a GLTFLoader set up with Draco or meshopt decoders.'],
    ] },
    { id: 'loading', title: 'Loading, placeholders and errors', paragraphs: [
      'A file loads once per URL and loader, on the first node that uses it. Until it has loaded, each node shows its placeholder box; then the factory asks the renderer to build the node again (requestAssetRebuild), which builds the model synchronously from the cached file. SceneRenderer.loaded resolves when the scene is first drawn, which can be before the files arrive; assetLoadsSettled() from @opsorama/three resolves once every started load has settled.',
      'A file that fails to load makes the node\'s build fail: the renderer reports "Scene node … could not be built: Could not load the glTF model <url>: …" through onError, the node stays empty, and the file is tried again when the node changes. preloadGltf(url) starts a load ahead of the scene and rejects when the file fails, for example to show a message before mounting.',
    ] },
    { id: 'sharing', title: 'Sharing, instancing and disposal', paragraphs: [
      'Every node built from a file shares its geometry, materials and textures. The renderer draws repeated meshes of different nodes as one InstancedMesh per batch (from four meshes with the same geometry and material, textures included), so twelve copies of a model cost about as many draw calls as four. getDiagnostics() reports the batches and instances.',
      'Shared parts are not disposed with a single node. When the last node that uses a file is removed or its renderer disposed, the file\'s geometry, materials and textures are released; a remount in the same task (React strict mode) keeps the file. A theme or palette change rebuilds glTF nodes from the cached file without loading it again.',
      'A glTF model keeps the file\'s materials: material roles, the scene palette and visual states do not recolor it, and it accepts no options. Use the node label, a marker or a selection style to show status.',
    ] },
    { id: 'animation', title: 'Animation clips', paragraphs: [
      'animation plays a clip from the file in a loop as the model\'s asset animation: it runs while scene motion is on and pauses with paused, motion: false and reduced motion. Skinned meshes are cloned with their skeletons. Animated parts render on their own, not in instanced batches. Register two factories for the same file to have still and animated copies; they share the file.',
    ], code: `const assets = createAssetRegistry({
  drone: gltfAsset('/models/drone.glb', { height: 0.7 }),
  'drone-flying': gltfAsset('/models/drone.glb', { height: 0.7, animation: 'rotors' }),
});`, language: 'typescript' },
    { id: 'compressed', title: 'Compressed files', paragraphs: [
      'Files compressed with Draco, meshopt or KTX2 textures need their decoders. Set up a GLTFLoader from three.js with them and pass it as loader; models load once per loader and URL. The decoder files are served by your application.',
    ], code: `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'));
const assets = { pump: gltfAsset('/models/pump-draco.glb', { height: 1.2, loader }) };`, language: 'typescript' },
    { id: 'custom', title: 'Your own asynchronous factories', paragraphs: [
      'The pieces gltfAsset uses are public in @opsorama/three for factories that load other content. A factory returns a placeholder object and, when its content has arrived, calls requestAssetRebuild(placeholder): the renderer (or a NodePreview) that holds it builds the node again. trackAssetLoad(promise) lets assetLoadsSettled() wait for the load. shareAssetResource(geometry or material) marks parts that several models use, so disposeObject and static merging leave them alone; the factory releases them itself, usually from addObjectRelease when its last model is released.',
    ] },
    { id: 'cli', title: 'Check and render from the command line', paragraphs: [
      'A scene file with glTF assets is checked and rendered with the module that registers them: opsorama check scene.json --assets assets.ts and opsorama render scene.json --assets assets.ts. Relative model URLs resolve against the scene file\'s directory, and render waits for the files before it takes the image.',
    ], code: `// assets.ts
import { gltfAsset } from '@opsorama/three/gltf';
export default { drone: gltfAsset('models/drone.glb', { height: 0.7 }) };`, language: 'typescript' },
    { id: 'provenance', title: 'Model provenance and licenses', paragraphs: [
      'Only use models whose license allows your use, and keep a record per file: source URL, author, license and any required attribution. Models under CC BY need visible credit; models with "no redistribution" terms cannot ship in a public repository or package. glTF files can carry the author and license in asset.copyright and asset.extras, but keep your own record as well.',
      'The example drone at /models/drone.glb is an original Opsorama model under the MIT License, generated by scripts/build-example-models.mjs in the repository; it contains no third-party geometry, textures or code.',
    ] },
  ],
};
