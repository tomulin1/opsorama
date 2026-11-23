import * as THREE from 'three';
import type { CameraFollowEnd, CameraFollowHeading, CameraFollowOptions, CameraKeyframe, CameraPath, CameraTransition, CameraTransitionResult, CameraView, SceneNode, SceneSnapshot, SceneStore, Selection, SceneOverlay, Vec3 } from '@opsorama/core';
import { DEFAULT_CAMERA_TRANSITION, validateCameraFollow, validateCameraPath, validateCameraTransition, validateCameraView, ZOOM_RANGE } from '@opsorama/core';
import { applyOrthographic, applyPerspective, clampPitch, ease, fitBounds, followExtent, followYaw, frameTarget, glideStep, groundExtent, groundRadius, groundTarget, interpolatePose, normalizeAngle, type CameraPose } from './camera-rig';
import { createCameraPathPlayer } from './camera-path';
import { disposeObject, type AssetRegistry } from './assets';
import { animateAsset } from './animation';
import { createOverlayObject } from './overlay';
import { bindCameraGestures } from './gestures';
import { bindWheelZoom } from './wheel-zoom';
import { startTransfer, advanceTransfer, type TransferState } from './transfer';
import { createRouteFollower, createControllerSlot, basicControllers, type ControllerContext, type ControllerOutput, type ControllerRegistry, type ControllerSlot, type RouteFollower, type RouteSample } from '@opsorama/core';
import { interiorAreas, isContained, isMotionNode, isNodeVisible, isWithinInteriorArea, nodeView, setNodeView, type InteriorArea } from '@opsorama/core';
import { applyShadowPolicy } from './shadows';
import { mergeStaticParts } from './static-merge';
import { createInstanceBatcher } from './instancing';
import { advanceCornerMarker, createCornerMarker, createGlowHighlight, selectionColor, showCornerMarker, type CornerMarker } from './selection-marker';
import { createPickTargetObject, highlightPickTarget, type PickTarget, type PickTargetMarker } from './pick-targets';
import { createMarkerElement, MARKER_STYLES } from './markers';
import { createBuildSlice, createLoadingIndicator, DEFAULT_BUILD_BUDGET, type LoadingIndicator, type SceneLoadState } from './loading';
import { buildNodeObject, contentBounds, createNodeTextures } from './nodes';
import { createFrameClock, validateFrameListener, type FrameListenerOptions, type SceneFrame } from './frame-clock';
import { createScenePointerEvent, hoverTransitions, resolvePointerTarget, selectionTarget, type PointerInput, type ScenePointerEvent, type ScenePointerEventType } from './pointer';
import { setupRendererPlugins, validateRendererPlugins, type PluginHost, type RendererPlugin } from './plugins';
export { createFrameClock, validateFrameListener, DEFAULT_MAX_FRAME_STEPS, FRAME_STEP_RANGE, MAX_FRAME_STEPS } from './frame-clock';
export type { FrameClock, FrameClockState, FrameListenerOptions, SceneFrame } from './frame-clock';
export { createScenePointerEvent, hoverTransitions, nearestNodeHit, nodeAncestors, resolvePointerTarget, selectionTarget, SCENE_POINTER_EVENT_TYPES } from './pointer';
export type { PointerInput, ScenePointerEvent, ScenePointerEventType, ScenePointerType } from './pointer';
export { setupRendererPlugins, validateRendererPlugins } from './plugins';
export type { PluginHost, RendererPlugin, RendererPluginContext } from './plugins';
export { createNodePreview, previewNodes, NODE_PREVIEW_MAX_NODES, NODE_PREVIEW_SPIN } from './preview';
export { createRendererSlot } from './renderer-slot';
export { IMAGE_LOAD_ERROR, IMAGE_PLACEHOLDER_COLORS, TEXT_COLORS } from './nodes';
export { MAX_TEXT_TEXTURE_SIZE, TEXT_CAP_PIXELS, TEXT_FONT, TEXT_LINE_SPACING } from './text-texture';
export type { RendererSlot } from './renderer-slot';
export type { NodePreview, NodePreviewOptions, NodePreviewState } from './preview';
export { createBuildSlice, createLoadingIndicator, DEFAULT_BUILD_BUDGET, loadingIndicatorAttributes, loadProgress, loadStateText, SCENE_LOADING_CLASSES, SCENE_LOADING_STYLES } from './loading';
export type { LoadingIndicator, SceneLoadPhase, SceneLoadState } from './loading';
export { createMarkerElement, markerAccessibleName, resolveMarkerAppearance, MARKER_ICON_ELEMENTS, MARKER_SHAPE_GEOMETRY, MARKER_STYLES, type MarkerAppearance } from './markers';
export { sampleRendererFps, type FrameSource, type FpsSamplerOptions } from './fps';
export { createInstanceBatcher, INSTANCING_MIN_COUNT, INSTANCED_BATCH_NAME } from './instancing';
export type { InstanceBatcher, InstancingStats } from './instancing';
export { advanceCornerMarker, createCornerMarker, createGlowHighlight, selectionColor, showCornerMarker } from './selection-marker';
export type { CornerMarker, GlowHighlight, SelectionEmphasis } from './selection-marker';
export { createPickTargetObject, highlightPickTarget } from './pick-targets';
export type { PickTarget, PickTargetMarker } from './pick-targets';
export { createOverlayObject } from './overlay';
export { addObjectRelease, assetValidator, createAssetRegistry, disposeObject } from './assets';
export type { AssetFactory, AssetRegistry, MaterialContext } from './assets';
export { applyShadowPolicy, SHADOW_MIN_WIDTH, SHADOW_CONTAINMENT_TOLERANCE } from './shadows';
export type { ShadowPlacement } from './shadows';
export { animateAsset, setAssetAnimator, hasAssetAnimator, assetAnimatedParts, clearAssetAnimator } from './animation';
export { mergeStaticParts, keepPartsSeparate, MERGED_PART_NAME } from './static-merge';
export type { StaticMergeReport } from './static-merge';
export type { AssetFrame, AssetAnimator } from './animation';
export interface RendererOptions { /** Required. Factories for every `AssetNode.asset` in the scene; the renderer has no built-in models. Use `catalogAssets` from `@opsorama/objects`, your own factories, or both merged with `createAssetRegistry`. An asset name missing from the registry fails with an error when its node is built. A theme or palette change rebuilds every asset node with the new `MaterialContext`, and every shape, line, text and image node with its palette colors. Shape, line, group, text and image nodes need no registry entry. */ assets: AssetRegistry; /** Default true. Draw repeated identical meshes of different nodes as one `InstancedMesh` per batch; false draws every mesh on its own, for comparisons and debugging. Rendering, picking, anchors and bounds are the same either way. Mount-time option: changing it remounts an adapter's renderer. */ instancing?: boolean; /** Default false. Mouse wheel over the canvas and its labels changes `SceneSettings.zoom` around the view centre, within `ZOOM_RANGE`, about 10% per notch. It takes the wheel from the page, so a scene embedded in a scrolling page enables it deliberately; at a zoom bound the wheel scrolls the page again. Hosts observe the change through the store. Mount-time option: changing it remounts an adapter's renderer. */ wheelZoom?: boolean; /** Default false: touch input stays with the page, so a scene embedded in a scrolling page scrolls and zooms with it, and a tap selects. True sets `touch-action: none` on the canvas (restored on dispose) and handles touch: one finger pans (ends following); two fingers pinch-zoom `SceneSettings.zoom` within `ZOOM_RANGE` (written at most once per animation frame) and keep the ground point between them in place (while following, the pinch zooms around the followed node instead); with `camera.controls: 'orbit'` a two-finger twist turns the yaw and a two-finger vertical drag the pitch (both keep following). With `controls: 'none'` one finger does nothing and two fingers only zoom. A tap that moves less than 5 px still selects; a gesture interrupts a running camera move or path like a mouse drag. Pens behave like a mouse either way. Mount-time option: changing it remounts an adapter's renderer. */ touchGestures?: boolean; /** Motion controllers by kind, added to (or overriding) `basicControllers`. */ controllers?: ControllerRegistry; /** Default `DEFAULT_BUILD_BUDGET` (12). Milliseconds of model building per slice during the initial load; the renderer then yields to the browser so the page stays responsive and the loading indicator updates. At least one node is built per slice. `Infinity` builds the whole scene inside `createSceneRenderer`. Later store changes always build at once. In a hidden document the load is not sliced. */ buildBudget?: number; /** Default true. Show the built-in loading indicator over the scene until the first frame. Adapters pass false and render their own. */ loadingIndicator?: boolean; /** Each change of the initial load: building progress, shader compilation, then `loaded` once the first frame is drawn. */ onLoad?: (state: SceneLoadState) => void; onSelect?: (selection: Selection | null) => void; /** Errors the renderer reports instead of throwing: a node that fails to build, an image node whose image fails to load (`name` is `IMAGE_LOAD_ERROR`; the message names the node and the URL, and the node keeps its placeholder), a lost graphics context, and errors thrown by listeners, controllers and plugins. */ onError?: (error: Error) => void;
  /**
   * Pointer events on the scene: `down`, `up`, `click`, `enter`, `leave` and `move` (at most once per animation frame), with
   * the nearest node under the pointer (selectable or not, grounds included), its `parentId` ancestors, the world point (on
   * a miss, the ground plane y = 0), modifiers and whether the pointer was on the canvas or a label; see `ScenePointerEvent`.
   * A `click` handler may call `preventSelection()` to skip the default selection and framing; otherwise selection works
   * exactly as without a handler. Over a pick target (`setPickTargets`) the target takes the input and no event is
   * reported. Events start with the first drawn frame. A throwing handler is reported to `onError`.
   */
  onPointer?: (event: ScenePointerEvent) => void;
  /**
   * Plugins, set up once after the first scene sync in this order and cleaned up in reverse order when the renderer is
   * disposed; see `RendererPlugin`. Names must be unique. When a setup throws, the renderer is disposed and
   * `createSceneRenderer` throws an error naming the plugin. Mount-time option: changing it remounts an adapter's renderer.
   */
  plugins?: readonly RendererPlugin[]; }
/** A playing camera path, returned by `renderer.playCameraPath`. */
export interface CameraPathPlayback {
  /** Stops the path where the camera is; `finished` resolves `'interrupted'`. No effect once the path has ended. */
  stop(): void;
  /** `'completed'` after the last keyframe's hold (never for a loop), `'interrupted'` when stopped or taken over. */
  finished: Promise<CameraTransitionResult>;
}
export interface SceneRenderer { /** Resolves once the whole initial scene is built and its first frame drawn. Stays pending when the renderer is disposed earlier. */ loaded: Promise<void>; /** Current state of the initial load. */ getLoadState(): SceneLoadState; /**
   * Clear the selection and return to the overview: the overview target (`CameraSettings.overview`), the settings' `yaw` and
   * `pitch`, and the overview scale. Without `transition` the target glides there (angles and scale change at once) and the
   * promise resolves at once; with `transition` the whole view moves on the transition's timing.
   */
  overview(options?: { transition?: CameraTransition }): Promise<CameraTransitionResult>;
  /**
   * Centre (or with `fit`, fit) a node from the current direction. During the initial load a node that is not built yet is
   * framed when the build finishes, at the zoom of this call. Without `transition` a centred node is glided to and a fitted one
   * is cut to, as before; with `transition` the view moves on its timing. The promise resolves `'completed'` when the camera
   * arrives (at once without a transition) and `'interrupted'` when something interrupts it or the node is unknown or hidden.
   * The orthographic camera at the overview scale moves only 0.48 of the way to a centred node, keeping more of the scene in view.
   */
  frame(id: string, options?: { fit?: boolean; transition?: CameraTransition }): Promise<CameraTransitionResult>;
  /** The view as drawn in the last frame: target, yaw within (−π, π], pitch and zoom (`SceneSettings.zoom`, or the eased zoom during a transition). */
  getCameraView(): CameraView;
  /**
   * Move the camera to a view; omitted fields keep their current values, and the scale at zoom 1 (overview or fitted node)
   * stays. Without `transition` it is a cut. A changed `zoom` is written to `SceneSettings.zoom` when the camera arrives (or,
   * when interrupted, where it stopped). Throws an actionable error for an invalid view or transition.
   */
  setCameraView(view: Partial<CameraView>, transition?: CameraTransition): Promise<CameraTransitionResult>;
  /** Calls `listener` with the new view after a rendered frame in which the view changed, at most once per frame. Returns the unsubscribe function. Listener errors go to `onError`. */
  onCameraChange(listener: (view: CameraView) => void): () => void;
  /**
   * Keep the camera on a node: every frame the target moves to the node's world position (routes, controllers, transfers
   * and carriers included), gliding there like a framed node and snapping with reduced motion. `heading: 'behind'` also
   * turns the yaw, smoothed, to look along the node's heading; an orbit drag turns around the followed node and keeps the
   * follow. A pan, `frame`, `overview`, `setCameraView`, a camera path or a selection change that moves the camera ends it
   * (`'interrupted'`); removing or hiding the node ends it (`'removed'`, also at once for a node that is unknown or not
   * built yet: await `loaded` first); `followNode(null)`, another call and `dispose` end it (`'stopped'`). The promise
   * resolves with that reason. Throws an actionable error for invalid options.
   */
  followNode(id: string | null, options?: CameraFollowOptions): Promise<CameraFollowEnd>;
  /** ID of the node the camera follows, or null. */
  getFollowedNode(): string | null;
  /**
   * Play a camera path from the current view on real seconds; see `CameraPath`. It interrupts a running move and ends
   * following. A drag, `frame`, `overview`, `setCameraView`, `followNode`, a yaw or pitch setting change, a zoom change from
   * elsewhere or a new path interrupts it where it is. A changed zoom is written to `SceneSettings.zoom` when it ends.
   * Throws an actionable error for an invalid path (`validateCameraPath`).
   */
  playCameraPath(path: CameraPath): CameraPathPlayback;
  /**
   * Calls `listener` from the frame loop and returns the unsubscribe function (safe to call more than once and from inside
   * a listener). Without `options.step` it runs once per rendered frame, after node motion and the camera move and before
   * labels are placed and the frame is drawn, with `delta` = real frame seconds (capped at 0.05) × `SceneSettings.speed`,
   * 0 while paused. With `step` (1/240–1/10 s) it runs on a fixed simulation step before node motion: zero or more times per
   * frame so that its scene time follows real time × speed, at most `maxSteps` (default 4) times per frame with the excess
   * dropped and reported in `SceneFrame.dropped`, never while paused or the document is hidden, and on with motion off.
   * Listeners start with the first drawn frame. A throwing listener is reported to `onError` and the loop continues.
   * Throws an actionable error for an invalid listener or options. See `SceneFrame`.
   */
  onFrame(listener: (frame: SceneFrame) => void, options?: FrameListenerOptions): () => void;
  dispose(): void; /** Current world pose, including instance/parent/rig transforms. Missing or hidden anchors return null, as do nodes not built yet during the initial load. */ getAnchor(id: string, name: string): { position: readonly [number, number, number]; rotation: readonly [number, number, number] } | null; /** Replace the debug overlay (e.g. from `navGraphOverlay`); null removes it. */ setOverlay(overlay: SceneOverlay | null): void; /** Show pickable boxes drawn over the scene, positioned once from the current anchor poses (a target whose node or anchor is missing gets no box); a click on one calls `onPick` with the target and its index instead of selecting, and the box under the pointer is highlighted. Null removes them. Move mode uses it through `bindMoveMode` from `@opsorama/objects/handling`. */ setPickTargets(targets: readonly PickTarget[] | null, onPick?: (target: PickTarget, index: number) => void): void; getDiagnostics(): { objects: number; disposed: boolean; /** The initial load finished and the first frame was drawn. */ loaded: boolean; drawCalls: number; geometries: number; /** Textures on the GPU (`WebGLRenderer.info.memory.textures`). Equal text nodes and image nodes with the same `src` share one texture, released with the last of them, so the count returns to its earlier value when they are removed. */ textures: number; /** Completed scene render calls since mount; excludes hidden-document callbacks. */ renderedFrames: number; /** Batches of repeated meshes drawn as one `InstancedMesh` each, and the meshes they draw. */ instanceBatches: number; instances: number }; }
/**
 * Compile every program the scene needs before its first frame. With KHR_parallel_shader_compile the
 * driver links in the background and this resolves when every program is ready; without it, linking
 * already happened in `compile`. Unlike `WebGLRenderer.compileAsync`, polling stops once `cancelled`
 * returns true, so disposing the renderer mid-compile neither throws nor keeps polling.
 */
function compileScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, cancelled: () => boolean): Promise<void> {
  let pending: Set<THREE.Material>;
  // A program that fails here fails again, and is reported, on the first frame.
  try { pending = renderer.compile(scene, camera); } catch { return Promise.resolve(); }
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => {
      if (cancelled()) { resolve(); return; }
      // `isReady` is false while linking and null after a lost context; only false keeps waiting.
      for (const material of pending) { const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean | null } }).currentProgram; if (!program || program.isReady() !== false) pending.delete(material); }
      if (pending.size === 0) resolve(); else setTimeout(check, 10);
    };
    check();
  });
}
const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
export function createSceneRenderer(container: HTMLElement, store: SceneStore, options: RendererOptions): SceneRenderer {
  // Checked before anything is created, so an invalid list leaves nothing to clean up.
  if (options.plugins !== undefined) validateRendererPlugins(options.plugins);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.16;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D operational scene'); renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  // The orthographic near plane lies behind the camera, which stands only 40 m from its target: at low zoom a long scene reaches past it on the camera side.
  // Both cameras exist from the start; `CameraSettings.projection` picks the one drawn, and switching keeps target and angles.
  const scene = new THREE.Scene(), orthographic = new THREE.OrthographicCamera(-20, 20, 12, -12, -150, 150), perspective = new THREE.PerspectiveCamera(30, 1, .1, 1000);
  let cameraSettings = store.getSnapshot().settings.camera, camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = cameraSettings.projection === 'perspective' ? perspective : orthographic;
  /** A `bounds` overview: target and extent fitted to the built content when the overview was applied. Null for the live `ground` overview. */
  type OverviewFit = { target: THREE.Vector3; extent: number };
  let overviewFit: OverviewFit | null = null;
  const overviewTarget = () => overviewFit ? overviewFit.target.clone() : groundTarget(store.getSnapshot().nodes);
  /** `target` is where the camera is heading, `currentTarget` what it shows; `yaw` and `pitch` are the drawn direction. */
  const target = overviewTarget(), currentTarget = target.clone(); let yaw = cameraSettings.yaw, pitch = cameraSettings.pitch;
  /**
   * A timed camera move: a `CameraTransition` or a camera path. `step` returns the pose at frame `time` (ms, real time) and,
   * once the move has ended, how; `arrive` applies the final pose of a completed move with the framing state it carries.
   */
  type CameraMove = { storeZoom: number; startExtent: number; step(time: number, cut: boolean): { pose: CameraPose; end?: CameraTransitionResult }; arrive(pose: CameraPose): void; resolve(result: CameraTransitionResult): void };
  let transition: CameraMove | null = null, transitionPose: CameraPose | null = null, cameraMoved = false;
  /** The followed node; `offset` is the yaw an orbit added to a `behind` follow. */
  let follow: { id: string; heading: CameraFollowHeading; offset: number; resolve(end: CameraFollowEnd): void } | null = null;
  const endFollow = (end: CameraFollowEnd) => { const active = follow; follow = null; active?.resolve(end); };
  /** Another move takes the camera: a running move is interrupted, following ends and a drag is released. */
  function takeCamera() { interruptTransition(); endFollow('interrupted'); pan?.cancel(); cameraMoved = true; }
  const ambient = new THREE.HemisphereLight('#f7faff', '#c2ccd9', 2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#ffffff', 2.6); sun.position.set(-12, 25, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -24; sun.shadow.camera.right = 24; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24; sun.shadow.normalBias = .035; scene.add(sun);
  // The frame loop updates world matrices once, before copying them into instance batches.
  scene.matrixWorldAutoUpdate = false; const instancing = options.instancing === false ? null : createInstanceBatcher(scene);
  const grid = new THREE.GridHelper(32, 32, '#9bb2cc', '#b7c8dc'); grid.position.y = .025; scene.add(grid);
  const labelLayer = document.createElement('div'); labelLayer.className = 'kit-scene-labels'; labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  // Marker styles travel with the label layer, so a host needs no stylesheet and disposal removes them.
  const markerStyles = document.createElement('style'); markerStyles.textContent = MARKER_STYLES; labelLayer.append(markerStyles);
  container.append(renderer.domElement, labelLayer);
  // Initial load: build in slices, compile shaders, then draw the first frame. Canvas and labels stay transparent (still hit-testable) until then.
  const buildBudget = options.buildBudget ?? DEFAULT_BUILD_BUDGET;
  let loadState: SceneLoadState = { phase: 'building', built: 0, total: 0 }, compileStarted = false, compiled = false, sliceTimer: ReturnType<typeof setTimeout> | undefined;
  /** A `frame` call made before its node was built, replayed when the build finishes. */
  let deferredFrame: { id: string; fit: boolean; zoom: number; resolve(result: CameraTransitionResult): void } | null = null;
  const settleDeferredFrame = (result: CameraTransitionResult) => { const pending = deferredFrame; deferredFrame = null; pending?.resolve(result); };
  /** Between build slices: entries waiting for instancing, and the snapshot and nodes the last slice left unbuilt. */
  let buildPending: Entry[] = [], sliceSnapshot: SceneSnapshot | null = null, sliceDeferred = new Set<string>();
  let resolveLoaded: () => void = () => undefined; const loaded = new Promise<void>(resolve => { resolveLoaded = resolve; });
  let indicator: LoadingIndicator | null = options.loadingIndicator === false ? null : createLoadingIndicator(container, store.getSnapshot().settings.theme);
  renderer.domElement.style.opacity = '0'; labelLayer.style.opacity = '0';
  const reportLoad = (next: SceneLoadState) => {
    if (next.phase === loadState.phase && next.built === loadState.built && next.total === loadState.total) return;
    loadState = next; indicator?.update(next, store.getSnapshot().settings.theme);
    try { options.onLoad?.(next); } catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); }
  };
  const assets = options.assets, controllers: ControllerRegistry = { ...basicControllers, ...options.controllers };
  type Entry = { node: SceneNode; object: THREE.Object3D; target: THREE.Vector3; label: HTMLButtonElement | null; labelHeight: number; /** Model-local bounds of selectable nodes, measured before instance transforms. */ bounds: THREE.Box3 | null; /** Built on first use. */ corners: CornerMarker | null; signature: string; follower: RouteFollower; controller: ControllerSlot; moving: boolean; transfer?: TransferState; /** Fixed per build: the node or its carrier chain has a parent container (`isContained`). */ contained: boolean; /** Current shadow placement, see `applyShadowPolicy`. */ indoor: boolean };
  const glow = createGlowHighlight(scene, mesh => mesh.visible || Boolean(instancing?.isProxy(mesh)));
  let pickTargets: { object: THREE.Group; targets: readonly PickTarget[]; onPick?: (target: PickTarget, index: number) => void } | null = null;
  const entries = new Map<string, Entry>(); let width = 1, height = 1, disposed = false, raf = 0, lastTime = 0, animationTime = 0; let hovered: string | null = null; let previousSelection: string | null = store.getSnapshot().selection?.nodeId ?? null;
  let fittedExtent: number | undefined; let shadowExtent = 24; let areas: InteriorArea[] = [];
  const pivot: [number, number, number] = [0, 0, 0];
  // Indoor nodes neither cast nor receive shadows; moving nodes are re-tested every frame against the interior areas.
  const updatePlacements = () => {
    for (const entry of entries.values()) {
      const world = entry.object.matrixWorld.elements; pivot[0] = world[12]; pivot[1] = world[13]; pivot[2] = world[14];
      const indoor = entry.contained || 'interior' in entry.node && entry.node.interior === true || isWithinInteriorArea(pivot, areas);
      if (indoor !== entry.indoor) { entry.indoor = indoor; applyShadowPolicy(entry.object, { interior: indoor }); instancing?.refresh(entry.object); }
    }
  };
  let pan: ReturnType<typeof bindCameraGestures> | undefined = undefined;
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const projected = new THREE.Vector3(); const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Child nodes own their resources independently of their container's shell.
  const cleanEntry = (entry: Entry) => { for (const child of entries.values()) if (child !== entry) { let parent = child.object.parent; while (parent && parent !== entry.object) parent = parent.parent; if (parent) child.object.removeFromParent(); } entry.object.removeFromParent(); entry.label?.remove(); instancing?.remove(entry.object); disposeObject(entry.object); };
  // Text and image textures are shared by equal nodes and released with the last of them; images report failed loads.
  const textures = createNodeTextures(), reportImageError = (error: Error) => { if (!disposed) options.onError?.(error); };
  const build = (node: SceneNode): THREE.Object3D => { const { theme, palette } = store.getSnapshot().settings; return buildNodeObject(node, { assets, theme, palette, textures, onError: reportImageError }); };
  /** Whether a click or hover can mark the node: it is selectable, and it has geometry or is a group of other nodes. */
  const markable = (entry: Entry | undefined) => Boolean(entry && (entry.bounds || entry.node.kind === 'group' && (entry.node.entityId || entry.node.selectable)));
  function sync() {
    const snapshot = store.getSnapshot();
    // A new yaw or pitch setting turns the camera at once and keeps its target.
    if (snapshot.settings.camera !== cameraSettings) {
      const previous = cameraSettings; cameraSettings = snapshot.settings.camera;
      if (cameraSettings.yaw !== previous.yaw || cameraSettings.pitch !== previous.pitch) { interruptTransition(); yaw = cameraSettings.yaw; pitch = cameraSettings.pitch; }
      if (cameraSettings.controls !== previous.controls) { pan?.cancel(); renderer.domElement.style.cursor = cameraSettings.controls === 'none' ? '' : 'grab'; }
    }
    scene.background = new THREE.Color(snapshot.settings.theme === 'midnight' ? '#17243b' : '#edf2fa'); ambient.intensity = snapshot.settings.theme === 'midnight' ? 1.05 : 2;
    grid.visible = snapshot.settings.grid; renderer.shadowMap.enabled = snapshot.settings.shadows;
    labelLayer.dataset.motion = snapshot.settings.motion && !snapshot.settings.paused ? 'on' : 'off';
    const nextShadowExtent = snapshot.nodes.reduce((extent, node) => node.kind === 'ground' ? Math.max(extent, node.size[0] / 2, node.size[1] / 2) : extent, 24);
    if (nextShadowExtent !== shadowExtent) { shadowExtent = nextShadowExtent; sun.shadow.camera.left = -shadowExtent; sun.shadow.camera.right = shadowExtent; sun.shadow.camera.top = shadowExtent; sun.shadow.camera.bottom = -shadowExtent; sun.shadow.camera.updateProjectionMatrix(); }
    const byId = new Map(snapshot.nodes.map(node => [node.id, node])); areas = interiorAreas(snapshot.nodes);
    const visibleNodes = snapshot.nodes.filter(node => isNodeVisible(node, snapshot.nodes, byId));
    const ids = new Set(visibleNodes.map(n => n.id)); for (const [id, entry] of entries) if (!ids.has(id)) { entry.controller.cancel('removed'); cleanEntry(entry); entries.delete(id); }
    const built: Entry[] = [], style = snapshot.settings.selectionStyle;
    // During the initial build only one slice of models is built per call; the rest waits for the next slice.
    const building = loadState.phase === 'building', slice = createBuildSlice(building && !document.hidden ? buildBudget : Infinity), deferred = new Set<string>();
    for (const node of visibleNodes) {
      // Placement is part of the signature: a carried node follows its carrier into or out of a container.
      // A later slice of an unchanged snapshot reuses the signatures of nodes an earlier slice built.
      const current = building && snapshot === sliceSnapshot && !sliceDeferred.has(node.id) ? entries.get(node.id) : undefined;
      const contained = current ? current.contained : isContained(node, byId), signature = current ? current.signature : JSON.stringify({ ...node, position: undefined, route: undefined, contained, ...(node.kind === 'marker' ? { materialPalette: snapshot.settings.palette } : {}), ...(node.kind === 'asset' || node.kind === 'shape' || node.kind === 'line' || node.kind === 'text' || node.kind === 'image' ? { paletteTheme: snapshot.settings.theme, materialPalette: snapshot.settings.palette } : {}) }); let entry = entries.get(node.id);
      if (!entry || entry.signature !== signature) {
        // A child waits for a deferred parent or carrier, so it is never built against an old one.
        if (building && (deferred.has(node.parentId ?? '') || deferred.has(node.attachment?.nodeId ?? '') || !slice.allow())) { deferred.add(node.id); continue; }
        // Narrow shadows per part first, then merge static parts grouped by the decided flags.
        const object = build(node); applyShadowPolicy(object, { interior: contained }); mergeStaticParts(object);
        // Measure before instance transforms; projected anchors below are in object-local coordinates.
        const labelHeight = node.kind === 'marker' ? 0 : typeof object.userData.labelHeight === 'number' ? object.userData.labelHeight : 1.65;
        // A group has no geometry of its own: its marker bounds are measured from its children when it is marked.
        const bounds = node.kind !== 'marker' && node.kind !== 'group' && (node.entityId || node.selectable) ? new THREE.Box3().setFromObject(object) : null;
        const sameParent = JSON.stringify(entry?.node.attachment) === JSON.stringify(node.attachment) && entry?.node.parentId === node.parentId;
        const oldPosition = sameParent ? entry?.object.position.clone() : undefined, oldYaw = entry?.follower.route || entry?.controller.active ? entry.object.rotation.y : undefined;
        // A transfer starts from the last rendered world pose; the old parent may already have been rebuilt in this sync.
        const transfer = entry && !sameParent && isMotionNode(node) && node.transfer ? startTransfer(entry.object, node.transfer) : undefined;
        if (entry) cleanEntry(entry);
        object.position.set(...(node.position || [0, 0, 0])); if (oldPosition) object.position.copy(oldPosition);
        if (node.rotation) object.rotation.set(...node.rotation); if (oldYaw !== undefined) object.rotation.y = oldYaw; if (node.scale) object.scale.set(...node.scale);
        object.traverse(child => { child.userData.nodeId = node.id; });
        let label: HTMLButtonElement | null = null;
        const text = typeof object.userData.labelText === 'string' ? object.userData.labelText : node.label;
        if (node.kind === 'marker') { label = createMarkerElement(node, snapshot.settings.palette); label.dataset.nodeId = node.id; const selectable = Boolean(node.entityId || node.selectable); label.addEventListener('click', event => labelClick(event, node.id, selectable)); labelLayer.append(label); }
        else if (text) { label = document.createElement('button'); label.className = `kit-node-label${node.kind === 'zone' ? ' kit-zone-label' : ''}${node.state === 'warning' ? ' kit-node-warning' : ''}`; if (object.userData.labelWrap === true) label.style.cssText = 'max-width:220px;white-space:normal;overflow-wrap:anywhere;'; const content = document.createElement('span'); content.className = 'kit-node-label-text'; content.textContent = text; label.append(content); label.setAttribute('aria-label', `Select ${text}`); label.dataset.nodeId = node.id; label.addEventListener('click', event => labelClick(event, node.id, true)); labelLayer.append(label); if (!node.entityId && !node.selectable) { label.disabled = true; label.style.pointerEvents = 'none'; } }
        // Keep quantity/record markers above models that have their own surface artwork.
        entry = { node, object, target: new THREE.Vector3(...(node.position || [0, 0, 0])), bounds, corners: null, label, labelHeight, signature, follower: entry?.follower ?? createRouteFollower(), controller: entry?.controller ?? createControllerSlot(), moving: false, contained, indoor: contained, ...(transfer ? { transfer } : {}) }; entries.set(node.id, entry); scene.add(object); built.push(entry);
      }
      entry.node = node; entry.target.set(...(node.position || [0, 0, 0]));
      const route = isMotionNode(node) ? node.route : undefined, wasFollowing = entry.follower.route !== null;
      // A replacement joins from the follower's own pose, not the smoothed object position, so visual timing matches the simulation.
      entry.follower.assign(route, entry.follower.sample()?.position ?? entry.object.position.toArray());
      // A controller starts from the current visual pose and keeps it across model rebuilds; a failing spec is reported, not retried.
      const wasControlled = entry.controller.active;
      if (isMotionNode(node)) try { entry.controller.assign(node, controllers); } catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); }
      if (!route && !entry.controller.active && (snapshot.settings.paused || !snapshot.settings.motion || reducedMotion.matches)) entry.object.position.copy(entry.target);
      if ((wasFollowing || wasControlled) && !route && !entry.controller.active) { entry.moving = false; entry.object.rotation.set(...(node.rotation || [0, 0, 0])); }
      const emphasis = snapshot.selection?.nodeId === node.id ? 'selected' : hovered === node.id ? 'hovered' : null;
      if (style === 'corners' && emphasis && entry.bounds && !entry.corners && node.kind !== 'group') { entry.corners = createCornerMarker(entry.bounds, typeof entry.object.userData.surfaceLevel === 'number' ? entry.object.userData.surfaceLevel : 0); entry.object.add(entry.corners.object); }
      if (entry.corners) showCornerMarker(entry.corners, style === 'corners' ? emphasis : null, selectionColor(node.state, snapshot.settings.palette));
      if (entry.label) { entry.label.hidden = !snapshot.settings.labels || (node.labelMode === 'active' && snapshot.selection?.nodeId !== node.id && hovered !== node.id); entry.label.classList.toggle('kit-node-selected', snapshot.selection?.nodeId === node.id); }
    }
    for (const entry of entries.values()) {
      const attachment = entry.node.attachment;
      const owner = attachment ? entries.get(attachment.nodeId)?.object : undefined;
      const parent = attachment ? attachment.anchor ? owner?.getObjectByName(`anchor-${attachment.anchor}`) : owner : entry.node.parentId ? entries.get(entry.node.parentId)?.object : scene;
      if (attachment && owner && !parent) throw new Error(`Unknown attachment anchor ${attachment.anchor} on ${attachment.nodeId}.`);
      if (parent && entry.object.parent !== parent) parent.add(entry.object);
    }
    // Register new objects once their world matrices and shadow placement are current. Nothing is drawn during the initial build, so this waits for its last slice.
    if (building && deferred.size) { buildPending.push(...built); sliceSnapshot = snapshot; sliceDeferred = deferred; }
    else {
      scene.updateMatrixWorld(true); updatePlacements();
      for (const entry of [...buildPending, ...built]) if (entries.get(entry.node.id) === entry) instancing?.add(entry.object);
      buildPending = []; sliceSnapshot = null; sliceDeferred = new Set();
    }
    if (follow && !entries.has(follow.id)) endFollow('removed');
    const selectedId = snapshot.selection?.nodeId || null;
    // A marked group is measured now that its children are in place; brackets follow a change of its contents.
    if (style === 'corners') for (const id of new Set([selectedId, hovered])) {
      const entry = id ? entries.get(id) : undefined;
      if (!entry || entry.node.kind !== 'group' || !markable(entry)) continue;
      const bounds = contentBounds(entry.object);
      if (entry.corners && entry.bounds && !entry.bounds.equals(bounds)) { entry.corners.object.removeFromParent(); disposeObject(entry.corners.object); entry.corners = null; }
      entry.bounds = bounds;
      if (!entry.corners) { entry.corners = createCornerMarker(bounds, bounds.isEmpty() ? 0 : bounds.min.y); entry.object.add(entry.corners.object); }
      showCornerMarker(entry.corners, id === selectedId ? 'selected' : 'hovered', selectionColor(entry.node.state, snapshot.settings.palette));
    }
    // A group's glow covers the meshes of the nodes inside it and is renewed on every sync, as they may have been rebuilt.
    for (const [emphasis, id] of [['selected', selectedId], ['hovered', hovered === selectedId ? null : hovered]] as const) { const entry = id ? entries.get(id) : undefined; glow.show(emphasis, style === 'glow' && markable(entry) ? entry!.object : null, selectionColor(entry?.node.state, snapshot.settings.palette), { descendants: entry?.node.kind === 'group' }); }
    if (selectedId !== previousSelection) { previousSelection = selectedId; if (cameraSettings.frameOnSelect) { if (selectedId) void frame(selectedId); else { pan?.cancel(); interruptTransition(); endFollow('interrupted'); target.copy(overviewTarget()); } } }
    if (building) {
      const total = visibleNodes.length;
      if (deferred.size) { reportLoad({ phase: 'building', built: total - deferred.size, total }); sliceTimer ??= setTimeout(() => { sliceTimer = undefined; if (!disposed) safeSync(); }, 0); }
      else {
        reportLoad({ phase: 'compiling', built: total, total });
        if (deferredFrame) { const { id, fit, zoom } = deferredFrame; void frameAt(id, fit, zoom); currentTarget.copy(target); settleDeferredFrame(entries.has(id) ? 'completed' : 'interrupted'); }
        // A `bounds` overview fits the content once it is built, unless the camera was already moved.
        else if (!cameraMoved && cameraSettings.overview === 'bounds') { overviewFit = boundsOverview(); target.copy(overviewTarget()); currentTarget.copy(target); }
      }
    }
  }
  const safeSync = () => { try { sync(); } catch (error) { if (loadState.phase !== 'loaded') { indicator?.dispose(); indicator = null; } options.onError?.(error instanceof Error ? error : new Error(String(error))); } };
  const unsubscribe = store.subscribe(safeSync);
  try { sync(); } catch (error) { clearTimeout(sliceTimer); unsubscribe(); entries.forEach(cleanEntry); textures.dispose(); glow.dispose(); instancing?.dispose(); disposeObject(grid); sun.shadow.dispose(); renderer.dispose(); container.replaceChildren(); throw error; }
  const resize = () => { pan?.cancel(); const bounds = container.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); renderer.setSize(width, height, false); updateCamera(); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function frame(id: string, options: { fit?: boolean; transition?: CameraTransition } = {}): Promise<CameraTransitionResult> {
    if (options.transition) validateCameraTransition(options.transition);
    if (disposed) return Promise.resolve('interrupted');
    const zoom = store.getSnapshot().settings.zoom;
    if (entries.has(id)) { settleDeferredFrame('interrupted'); return frameAt(id, Boolean(options.fit), zoom, options.transition); }
    if (loadState.phase === 'building') { settleDeferredFrame('interrupted'); cameraMoved = true; return new Promise(resolve => { deferredFrame = { id, fit: Boolean(options.fit), zoom, resolve }; }); }
    return Promise.resolve('interrupted');
  }
  function frameAt(id: string, fit: boolean, zoom: number, transition?: CameraTransition): Promise<CameraTransitionResult> {
    const entry = entries.get(id); if (!entry) return Promise.resolve('interrupted');
    pan?.cancel(); cameraMoved = true; endFollow('interrupted');
    let nextTarget: THREE.Vector3, nextExtent = fittedExtent;
    if (fit) { const fitted = fitBounds(new THREE.Box3().setFromObject(entry.object), yaw, pitch); nextExtent = fitted.extent * zoom; nextTarget = fitted.target; }
    else nextTarget = frameTarget(entry.object.getWorldPosition(new THREE.Vector3()), cameraSettings.projection, fittedExtent !== undefined);
    if (transition) return startTransition(() => ({ to: { target: nextTarget.toArray(), yaw, pitch, zoom: store.getSnapshot().settings.zoom, extent: nextExtent ?? overviewExtent() }, fittedExtent: nextExtent, overviewFit }), transition);
    interruptTransition();
    // A fitted node is cut to; a centred one is glided to.
    if (fit) { fittedExtent = nextExtent; target.copy(nextTarget); currentTarget.copy(target); } else target.copy(nextTarget);
    return Promise.resolve('completed');
  }
  /** The `bounds` overview of the built content seen from the settings' direction, or null when nothing has bounds yet. */
  function boundsOverview(): OverviewFit | null {
    const bounds = new THREE.Box3();
    for (const entry of entries.values()) if (!entry.node.parentId && !entry.node.attachment && entry.node.kind !== 'marker') bounds.expandByObject(entry.object);
    return bounds.isEmpty() ? null : fitBounds(bounds, cameraSettings.yaw, cameraSettings.pitch);
  }
  /** Scale at zoom 1 when no node is fitted: the `bounds` overview, or the live ground extent. */
  function overviewExtent() { return overviewFit?.extent ?? groundExtent(store.getSnapshot().nodes); }
  /** The pose drawn now: the eased pose of a running transition, otherwise the current target and direction at the zoom setting. */
  function currentPose(): CameraPose { return transitionPose ?? { target: currentTarget.toArray(), yaw, pitch, zoom: store.getSnapshot().settings.zoom, extent: fittedExtent ?? overviewExtent() }; }
  /** Ends a running move where it is: the target stops, a changed scale becomes the fitted scale and a changed zoom is written to the store. */
  function interruptTransition() {
    const active = transition; if (!active) return;
    const pose = transitionPose; transition = null; transitionPose = null;
    if (pose) {
      target.copy(currentTarget);
      if (pose.extent !== active.startExtent) fittedExtent = pose.extent;
      // This may run inside a store notification; the zoom is written after it.
      const zoom = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(pose.zoom * 1e4) / 1e4));
      if (Math.abs(pose.zoom - active.storeZoom) > 1e-9 && zoom !== active.storeZoom) queueMicrotask(() => { if (!disposed && store.getSnapshot().settings.zoom === active.storeZoom) store.configure({ zoom }); });
    }
    active.resolve('interrupted');
  }
  function arrive(to: CameraPose, framing: { fittedExtent: number | undefined; overviewFit: OverviewFit | null }) {
    target.set(...to.target); currentTarget.copy(target); yaw = to.yaw; pitch = to.pitch; fittedExtent = framing.fittedExtent; overviewFit = framing.overviewFit;
    if (to.zoom !== store.getSnapshot().settings.zoom) store.configure({ zoom: to.zoom });
  }
  /** Starts a camera move. `plan` runs after a running transition is interrupted, so it starts where the camera stopped. */
  function startTransition(plan: () => { to: CameraPose; fittedExtent: number | undefined; overviewFit: OverviewFit | null }, options: CameraTransition | undefined): Promise<CameraTransitionResult> {
    takeCamera();
    const { to, ...framing } = plan(), seconds = options ? options.seconds ?? DEFAULT_CAMERA_TRANSITION.seconds : 0, settings = store.getSnapshot().settings;
    // Reduced motion, motion off, a zero duration and the initial load make it a cut.
    if (seconds === 0 || reducedMotion.matches || !settings.motion || loadState.phase !== 'loaded') { arrive(to, framing); return Promise.resolve('completed'); }
    const from = currentPose(), easing = options?.easing ?? DEFAULT_CAMERA_TRANSITION.easing; let start: number | null = null;
    return new Promise(resolve => { transition = { storeZoom: settings.zoom, startExtent: from.extent, resolve, arrive: () => arrive(to, framing), step: (time, cut) => {
      start ??= time; const t = cut ? 1 : (time - start) / 1000 / seconds;
      return { pose: interpolatePose(from, to, ease(t, easing)), ...(t >= 1 ? { end: 'completed' as const } : {}) };
    } }; });
  }
  /** Pose of a path keyframe: `frame` sets the target (and with `fit` the scale) from the node now; `view` fields override. */
  function resolveKeyframe(keyframe: CameraKeyframe, previous: CameraPose): CameraPose | null {
    const view = keyframe.view ?? {}, yaw = view.yaw ?? previous.yaw, pitch = view.pitch ?? previous.pitch, zoom = view.zoom ?? previous.zoom;
    let target: Vec3 = view.target ? [...view.target] as unknown as Vec3 : previous.target, extent = previous.extent;
    if (keyframe.frame) {
      const entry = entries.get(keyframe.frame.nodeId); if (!entry) return null;
      if (keyframe.frame.fit) { const fitted = fitBounds(new THREE.Box3().setFromObject(entry.object), yaw, pitch); target = fitted.target.toArray(); extent = fitted.extent * zoom; }
      else target = entry.object.getWorldPosition(new THREE.Vector3()).setY(0).toArray();
    }
    return { target, yaw, pitch, zoom, extent };
  }
  const followPosition = new THREE.Vector3(), followForward = new THREE.Vector3(), followQuaternion = new THREE.Quaternion();
  /** Moves the target to the followed node and, for a `behind` follow, turns the yaw toward its heading. */
  function advanceFollow(dt: number) {
    const followed = follow && entries.get(follow.id);
    if (!follow || !followed) return;
    target.copy(followed.object.getWorldPosition(followPosition));
    if (follow.heading === 'behind') {
      followForward.set(0, 0, 1).applyQuaternion(followed.object.getWorldQuaternion(followQuaternion));
      yaw = followYaw(yaw, Math.atan2(followForward.x, followForward.z), follow.offset, dt, reducedMotion.matches);
    }
  }
  /** Advances the camera by `dt` seconds at frame `time` (ms, real time) and places the drawn camera. */
  function advanceCamera(dt: number, time: number) {
    const settings = store.getSnapshot().settings, active = transition;
    if (active) {
      // A zoom change from elsewhere (wheel, a control) interrupts; with motion off or reduced a transition finishes at once and a path cuts.
      if (settings.zoom !== active.storeZoom) interruptTransition();
      else {
        const { pose, end } = active.step(time, reducedMotion.matches || !settings.motion);
        transitionPose = pose; currentTarget.set(...pose.target); target.copy(currentTarget); yaw = pose.yaw; pitch = pose.pitch;
        if (end === 'completed') { transition = null; transitionPose = null; active.arrive(pose); active.resolve('completed'); }
        else if (end) interruptTransition();
      }
    }
    else { advanceFollow(dt); currentTarget.lerp(target, glideStep(dt, reducedMotion.matches)); }
    updateCamera();
  }
  /** Places the camera of the current projection for the drawn pose and viewport. */
  function updateCamera() {
    const snapshot = store.getSnapshot(), view = { width, height, fov: snapshot.settings.camera.fov, radius: Math.max(groundRadius(snapshot.nodes), (overviewFit?.extent ?? 0) * 34) };
    camera = snapshot.settings.camera.projection === 'perspective' ? perspective : orthographic;
    if (camera === perspective) applyPerspective(perspective, currentPose(), view); else applyOrthographic(orthographic, currentPose(), view);
  }
  const cameraListeners = new Set<(view: CameraView) => void>(); let emittedView: CameraView | null = null;
  const clock = createFrameClock(error => options.onError?.(toError(error)));
  function getCameraView(): CameraView {
    const pose = currentPose();
    return Object.freeze({ target: Object.freeze(currentTarget.toArray()) as Vec3, yaw: normalizeAngle(pose.yaw), pitch: pose.pitch, zoom: pose.zoom });
  }
  function emitCameraChange() {
    if (!cameraListeners.size) { emittedView = null; return; }
    const view = getCameraView(), last = emittedView;
    if (last && Math.abs(view.yaw - last.yaw) < 1e-9 && Math.abs(view.pitch - last.pitch) < 1e-9 && Math.abs(view.zoom - last.zoom) < 1e-9 && view.target.every((value, axis) => Math.abs(value - last.target[axis]) < 1e-6)) return;
    emittedView = view;
    for (const listener of [...cameraListeners]) try { listener(view); } catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); }
  }
  /** Other nodes' live poses in the controlled node's parent space. */
  const controllerContext = (entry: Entry): ControllerContext => ({
    node: entry.node as ControllerContext['node'],
    pose(id) {
      const other = entries.get(id);
      if (!other || !other.object.parent) return null;
      const position = other.object.getWorldPosition(new THREE.Vector3()), quaternion = other.object.getWorldQuaternion(new THREE.Quaternion());
      const parent = entry.object.parent;
      if (parent) { parent.updateWorldMatrix(true, false); parent.worldToLocal(position); quaternion.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert()); }
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
      return { position: position.toArray(), yaw: Math.atan2(forward.x, forward.z) };
    },
  });
  // `turn` blends heading changes at corners (0–1 per frame); 1 applies the exact heading while turning in place or driving a rounded corner.
  const applySample = (entry: Entry, sample: RouteSample | null, turn = 1) => {
    if (!sample) return; entry.object.position.set(...sample.position); entry.moving = sample.moving;
    const delta = Math.atan2(Math.sin(sample.yaw - entry.object.rotation.y), Math.cos(sample.yaw - entry.object.rotation.y)); entry.object.rotation.y += delta * turn;
  };
  function select(id: string | null, origin: Selection['origin']) { store.select(id, origin); if (cameraSettings.frameOnSelect) { if (id) void frame(id); else if (!follow) target.copy(overviewTarget()); } options.onSelect?.(store.getSnapshot().selection); }
  const aim = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1); raycaster.setFromCamera(pointer, camera); };
  /** Index of the pick target under the pointer, nearest first, or null. */
  function pickTargetAt(event: PointerEvent): number | null {
    if (!pickTargets) return null;
    aim(event);
    const hit = raycaster.intersectObjects(pickTargets.object.children, false)[0];
    return hit ? hit.object.userData.pickTarget as number : null;
  }
  /** Hits under the pointer, nearest first: visible meshes and sprites (billboard text and images) and instancing proxies of the built nodes. */
  function intersect(event: PointerEvent) {
    aim(event);
    return raycaster.intersectObjects([...entries.values()].filter(e => !e.node.parentId && !e.node.attachment).map(e => e.object), true).filter(hit => (hit.object instanceof THREE.Mesh || hit.object instanceof THREE.Sprite) && (hit.object.visible || instancing?.isProxy(hit.object)));
  }
  /** The node a click selects: the nearest hit when its node is selectable, otherwise its nearest selectable group; see `selectionTarget`. */
  function selectableHit(hits: THREE.Intersection[]) {
    const id = hits[0]?.object.userData.nodeId as string | undefined;
    return id ? selectionTarget(id, getNode) : undefined;
  }
  function pick(event: PointerEvent) { return selectableHit(intersect(event)); }
  // Pointer events for `onPointer`: the nearest node of any kind and the world point, from the same ray as selection.
  const getNode = (id: string) => entries.get(id)?.node;
  type PointerTarget = { nodeId: string | null; point: Vec3 | null; source: 'canvas' | 'label' };
  /** Nearest node and world point under the canvas pointer, after `intersect`; on a miss, the ground plane point. */
  const canvasTarget = (hits: THREE.Intersection[]): PointerTarget => ({ ...resolvePointerTarget(hits, raycaster.ray, id => entries.has(id)), source: 'canvas' });
  /** A label stands for its node; the point is the node's world position. */
  function labelTarget(id: string): PointerTarget {
    const entry = entries.get(id);
    return { nodeId: entry ? id : null, point: entry ? entry.object.getWorldPosition(new THREE.Vector3()).toArray() : null, source: 'label' };
  }
  /** The label of a node under a DOM event target, if any. */
  const labelOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId : undefined;
  /** Reports a pointer event; returns false when a `click` handler called `preventSelection()`. */
  function emitPointer(type: ScenePointerEventType, target: PointerTarget, input: PointerInput): boolean {
    const handler = options.onPointer;
    if (!handler || disposed) return true;
    const { event, selectionPrevented } = createScenePointerEvent(type, target, input, target.source, getNode);
    try { handler(event); } catch (error) { options.onError?.(toError(error)); }
    return !selectionPrevented();
  }
  /** Node under the pointer as last reported by `enter`/`leave`, and the latest unprocessed move (handled once per frame). */
  let pointerNode: string | null = null, pendingMove: { event: PointerEvent; label: string | undefined } | null = null;
  function hoverPointer(target: PointerTarget, input: PointerInput) {
    for (const { type, nodeId } of hoverTransitions(pointerNode, target.nodeId)) emitPointer(type, type === 'leave' ? { ...target, nodeId } : target, input);
    pointerNode = target.nodeId;
  }
  /** Pointer target of a canvas or label event, or null when a pick target takes the input. */
  function pointerTargetOf(event: PointerEvent, label: string | undefined): PointerTarget | null {
    if (label) return labelTarget(label);
    if (pickTargetAt(event) !== null) return null;
    return canvasTarget(intersect(event));
  }
  /** Runs once per drawn frame: `enter`/`leave` and one `move` for the latest pointer position. */
  function flushPointerMove() {
    const pending = pendingMove; pendingMove = null;
    if (!pending || !options.onPointer) return;
    const target = pointerTargetOf(pending.event, pending.label);
    if (!target) { hoverPointer({ nodeId: null, point: null, source: 'canvas' }, pending.event); return; }
    hoverPointer(target, pending.event); emitPointer('move', target, pending.event);
  }
  const onPointerButton = (type: 'down' | 'up', source: 'canvas' | 'label') => (event: PointerEvent) => {
    if (!options.onPointer || loadState.phase !== 'loaded') return;
    const label = source === 'label' ? labelOf(event.target) : undefined;
    if (source === 'label' && !label) return;
    const target = pointerTargetOf(event, label);
    if (target) emitPointer(type, target, event);
  };
  const onPointerMove = (source: 'canvas' | 'label') => (event: PointerEvent) => {
    if (!options.onPointer || loadState.phase !== 'loaded') return;
    const label = source === 'label' ? labelOf(event.target) : undefined;
    if (source === 'label' && !label) return;
    pendingMove = { event, label };
  };
  const onPointerLeave = (event: PointerEvent) => { pendingMove = null; if (pointerNode) hoverPointer({ nodeId: null, point: null, source: 'canvas' }, event); };
  /** A label click (pointer or keyboard): report it, then select unless prevented. */
  function labelClick(event: MouseEvent, id: string, selectable: boolean) {
    const allowed = loadState.phase !== 'loaded' || emitPointer('click', labelTarget(id), event);
    if (allowed && selectable) select(id, 'keyboard');
  }
  const pointerListeners: [EventTarget, string, (event: PointerEvent) => void][] = [
    [renderer.domElement, 'pointerdown', onPointerButton('down', 'canvas')], [renderer.domElement, 'pointerup', onPointerButton('up', 'canvas')], [renderer.domElement, 'pointermove', onPointerMove('canvas')],
    [labelLayer, 'pointerdown', onPointerButton('down', 'label')], [labelLayer, 'pointerup', onPointerButton('up', 'label')], [labelLayer, 'pointermove', onPointerMove('label')], [container, 'pointerleave', onPointerLeave],
  ];
  // Registered before the camera gestures, so `down` and `up` reach the handler before the `click` the gestures report.
  if (options.onPointer) for (const [target, type, listener] of pointerListeners) target.addEventListener(type, listener as EventListener);
  let peekId: string | null = null, pendingPeek: string | null = null, peekTimer: ReturnType<typeof setTimeout> | undefined;
  function changePeek(next: string | null) {
    if (next === pendingPeek) return;
    pendingPeek = next; clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (disposed) return;
      if (peekId && peekId !== next) {
        const old = store.getSnapshot().nodes.find(node => node.id === peekId);
        if (old?.kind === 'asset' && old.view === 'peek') setNodeView(store, peekId, 'closed');
      }
      peekId = next;
      const node = next ? store.getSnapshot().nodes.find(node => node.id === next) : undefined;
      if (node?.kind === 'asset' && nodeView(node) === 'closed') setNodeView(store, node.id, 'peek');
    }, next ? 160 : 280);
  }
  /** The nearest container under the pointer that peeks on hover: an asset with `peekOnHover` and factory `containerBounds`. */
  function hoveredContainer(): string | null {
    let closest = Infinity, result: string | null = null;
    for (const entry of entries.values()) {
      if (entry.node.kind !== 'asset' || !entry.node.peekOnHover) continue;
      const bounds = entry.object.userData.containerBounds as THREE.Box3 | undefined;
      if (!bounds) continue;
      const ray = raycaster.ray.clone().applyMatrix4(entry.object.matrixWorld.clone().invert());
      const point = ray.intersectBox(bounds, new THREE.Vector3());
      if (!point) continue;
      const distance = point.applyMatrix4(entry.object.matrixWorld).distanceTo(raycaster.ray.origin);
      if (distance < closest) { closest = distance; result = entry.node.id; }
    }
    return result;
  }
  /** Whether the built model of `id` declares `containerBounds`, the factory hint for a container. */
  function isContainer(id: string): boolean {
    return entries.get(id)?.object.userData.containerBounds !== undefined;
  }
  const onClick = (event: PointerEvent) => {
    // The canvas is transparent until the first frame; a click must not select what nobody can see yet.
    if (loadState.phase !== 'loaded') return;
    const index = pickTargetAt(event);
    if (index !== null) { pickTargets!.onPick?.(pickTargets!.targets[index], index); return; }
    const hits = intersect(event);
    if (options.onPointer && !emitPointer('click', canvasTarget(hits), event)) return;
    select(selectableHit(hits) || null, 'pointer');
  };
  const onMove = (event: PointerEvent) => {
    if (loadState.phase !== 'loaded') return;
    if (pickTargets) {
      const index = pickTargetAt(event);
      highlightPickTarget(pickTargets.object, index);
      if (index !== null) { renderer.domElement.style.cursor = 'pointer'; return; }
    }
    const labelId = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-node-id]')?.dataset.nodeId : undefined;
    const picked = pick(event), next = labelId || picked || null;
    // Floating interior labels are part of the inspection region too.
    let labelNode = labelId ? entries.get(labelId)?.node : undefined;
    while (labelNode && !isContainer(labelNode.id)) labelNode = labelNode.parentId ? entries.get(labelNode.parentId)?.node : undefined;
    if (event.pointerType === 'mouse') changePeek(labelNode?.kind === 'asset' && labelNode.peekOnHover ? labelNode.id : hoveredContainer());
    renderer.domElement.style.cursor = next ? 'pointer' : cameraSettings.controls === 'none' ? '' : 'grab'; if (next !== hovered) { hovered = next; safeSync(); }
  };
  const leave = () => { changePeek(null); if (hovered) { hovered = null; safeSync(); } };
  container.addEventListener('pointerleave', leave); labelLayer.addEventListener('pointermove', onMove);
  pan = bindCameraGestures(renderer.domElement, () => camera, { getTarget: () => currentTarget, setTarget: value => { changePeek(null); cameraMoved = true; target.copy(value); currentTarget.copy(value); if (hovered) { hovered = null; safeSync(); } }, onClick, onHover: onMove, canDrag: () => cameraSettings.controls !== 'none', canOrbit: () => cameraSettings.controls === 'orbit',
    // An orbit turns around the current target and keeps following; a pan ends it.
    orbit: (deltaYaw, deltaPitch) => { changePeek(null); cameraMoved = true; yaw += deltaYaw; pitch = clampPitch(pitch + deltaPitch); if (follow) follow.offset += deltaYaw; },
    onDragStart: mode => { const moving = transition !== null || mode === 'pan' && follow !== null; interruptTransition(); if (mode === 'pan') endFollow('interrupted'); if (moving) updateCamera(); return moving; },
    // A pinch writes the zoom setting like the wheel; while following it zooms and turns around the followed node, so following continues.
    getZoom: () => store.getSnapshot().settings.zoom, setZoom: zoom => store.configure({ zoom }), pinchPans: () => follow === null }, { touch: options.touchGestures === true });
  const wheelZoom = options.wheelZoom ? bindWheelZoom([renderer.domElement, labelLayer], { getZoom: () => store.getSnapshot().settings.zoom, setZoom: zoom => store.configure({ zoom }) }) : null;
  const onContextLost = (event: Event) => { event.preventDefault(); pan?.cancel(); cancelAnimationFrame(raf); clearTimeout(sliceTimer); indicator?.dispose(); indicator = null; options.onError?.(new Error('Graphics context lost. Reload the scene to recover; records remain available in the host HTML view.')); };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  let renderedFrames = 0;
  function animate(time: number) {
    if (disposed) return; const dt = Math.min(.05, lastTime ? (time - lastTime) / 1000 : .016); lastTime = time; const settings = store.getSnapshot().settings;
    // Until the build finishes nothing is drawn; then shaders compile (in parallel where the browser supports it) before the first frame.
    if (loadState.phase !== 'loaded' && !compiled) {
      if (loadState.phase === 'compiling' && !compileStarted && !document.hidden) {
        compileStarted = true; scene.updateMatrixWorld(); instancing?.update();
        compileScene(renderer, scene, camera, () => disposed).then(() => { compiled = true; }, () => { compiled = true; });
      }
      raf = requestAnimationFrame(animate); return;
    }
    if (!document.hidden) {
      const animated = settings.motion && !reducedMotion.matches;
      // Pointer input first, against the frame the user saw; then fixed simulation steps, before node motion.
      flushPointerMove();
      clock.steps(dt, { speed: settings.speed, paused: settings.paused, animated, hidden: false });
      for (const entry of entries.values()) {
        // Routes own the root transform; motion-off and reduced motion show the confirmed result without travel.
        if (entry.follower.route) { if (!animated) applySample(entry, entry.follower.settle()); else if (!settings.paused) { const sample = entry.follower.advance(dt * settings.speed); applySample(entry, sample, sample?.turning || sample?.curving ? 1 : 1 - Math.exp(-dt * 10 * settings.speed)); } else entry.moving = false; }
        // Controllers own the root transform too; they settle without travel while motion is off or reduced.
        else if (entry.controller.active) {
          const pose = { position: entry.object.position.toArray(), yaw: entry.object.rotation.y }, context = controllerContext(entry);
          let output: ControllerOutput | null = null;
          try { output = !animated ? entry.controller.settle(pose, context) : settings.paused ? null : entry.controller.advance({ delta: dt * settings.speed, time: animationTime }, pose, context); }
          catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); }
          if (output) { entry.object.position.set(...output.position); entry.object.rotation.y = output.yaw; }
          entry.moving = Boolean(output?.moving) && animated;
        }
        // A transfer owns the local transform until it finishes; pause holds it, motion-off and reduced motion finish it.
        else if (entry.transfer) { if (!advanceTransfer(entry.object, entry.transfer, entry.target, entry.node.rotation || [0, 0, 0], animated ? (settings.paused ? 0 : dt * settings.speed) : Infinity)) entry.transfer = undefined; }
        else if (!animated || settings.paused) entry.object.position.copy(entry.target);
        else entry.object.position.lerp(entry.target, 1 - Math.exp(-dt * 3.2 * settings.speed));
      }
      if (!settings.paused && animated) {
        const animationDelta = dt * settings.speed; animationTime += animationDelta;
        for (const entry of entries.values()) if (entry.node.kind !== 'asset' || entry.node.localMotion !== false) animateAsset(entry.object, { time: animationTime, delta: animationDelta, ...(entry.follower.route || entry.controller.active ? { locomotion: { moving: entry.moving } } : {}) });
      }
      for (const entry of entries.values()) if (entry.corners) advanceCornerMarker(entry.corners, animated && !settings.paused ? dt : Infinity);
      // The camera moves after the nodes, so a followed node is met at this frame's pose.
      advanceCamera(dt, time);
      // Per-frame listeners see this frame's node poses and camera; what they change is drawn in this frame.
      clock.frame(dt, { speed: settings.speed, paused: settings.paused, animated, hidden: false });
      const labelRects: { x: number; y: number; width: number }[] = [];
      const selectionId = store.getSnapshot().selection?.nodeId;
      // Markers are placed first and never move or hide; other labels make way for them.
      const labelPriority = (entry: Entry) => entry.node.kind === 'marker' ? 6 : entry.node.id === selectionId ? 5 : entry.node.state === 'critical' ? 4 : entry.node.state === 'warning' ? 3 : entry.node.kind === 'zone' ? 2 : 1;
      const ordered = [...entries.values()].sort((a, b) => labelPriority(b) - labelPriority(a));
      // Measure before changing transforms; host CSS can render compact icons or wrapped labels.
      const labelWidths = new Map(ordered.filter(entry => entry.label && !entry.label.hidden).map(entry => [entry.node.id, entry.label!.offsetWidth]));
      for (const entry of ordered) {
        if (!entry.label || entry.label.hidden) continue;
        projected.set(0, entry.node.kind === 'zone' ? .3 : entry.labelHeight, entry.node.kind === 'zone' ? -entry.node.size[1] / 2 - 2 : 0); entry.object.localToWorld(projected); projected.project(camera);
        // Behind the camera or outside its depth range: hide the label instead of mirroring it into the view.
        if (Math.abs(projected.z) > 1) { entry.label.style.visibility = 'hidden'; continue; }
        const x = (projected.x + 1) * width / 2, labelWidth = labelWidths.get(entry.node.id) ?? 0;
        let y = (1 - projected.y) * height / 2 - (entry.node.kind === 'zone' ? 35 : 0);
        const collides = () => labelRects.some(rect => Math.abs(x - rect.x) < (labelWidth + rect.width) / 2 + 5 && Math.abs(y - rect.y) < 27);
        for (let attempt = 0; entry.node.kind !== 'marker' && attempt < 4 && collides(); attempt++) {
          const nextY = y + (entry.node.kind === 'zone' ? -28 : 28);
          if (nextY < 12 || nextY > height - 18) break;
          y = nextY;
        }
        const overlaps = entry.node.kind !== 'marker' && collides();
        entry.label.style.visibility = overlaps ? 'hidden' : 'visible';
        entry.label.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
        if (!overlaps) labelRects.push({ x, y, width: labelWidth });
      } if (areas.length) updatePlacements(); scene.updateMatrixWorld(); instancing?.update(); glow.update(time / 1000, animated && !settings.paused); renderer.render(scene, camera); renderedFrames++; emitCameraChange();
      if (loadState.phase !== 'loaded') {
        renderer.domElement.style.opacity = ''; labelLayer.style.opacity = ''; indicator?.dispose(); indicator = null;
        reportLoad({ ...loadState, phase: 'loaded' }); resolveLoaded();
      }
    } raf = requestAnimationFrame(animate);
  }
  raf = requestAnimationFrame(animate);
  let overlayObject: THREE.Object3D | null = null;
  const clearPickTargets = () => { if (pickTargets) { scene.remove(pickTargets.object); disposeObject(pickTargets.object); pickTargets = null; } };
  const clearOverlay = () => { if (overlayObject) { scene.remove(overlayObject); disposeObject(overlayObject); overlayObject = null; } };
  // `disposing` keeps a plugin cleanup that disposes the renderer again from running the disposal twice.
  let plugins: PluginHost | null = null, disposing = false;
  const api: SceneRenderer = {
    frame,
    getCameraView,
    setCameraView: (view, transition) => {
      validateCameraView(view); if (transition) validateCameraTransition(transition);
      if (disposed) return Promise.resolve('interrupted');
      settleDeferredFrame('interrupted');
      return startTransition(() => { const pose = currentPose(); return { to: { target: view.target ? [...view.target] as unknown as Vec3 : pose.target, yaw: view.yaw ?? pose.yaw, pitch: view.pitch ?? pose.pitch, zoom: view.zoom ?? pose.zoom, extent: pose.extent }, fittedExtent, overviewFit }; }, transition);
    },
    onCameraChange: listener => { if (disposed) return () => undefined; cameraListeners.add(listener); return () => { cameraListeners.delete(listener); }; },
    onFrame: (listener, frameOptions) => { validateFrameListener(listener, frameOptions); return disposed ? () => undefined : clock.add(listener, frameOptions); },
    followNode: (id, followOptions = {}) => {
      validateCameraFollow(followOptions);
      if (disposed) return Promise.resolve('stopped');
      endFollow('stopped');
      if (id === null) return Promise.resolve('stopped');
      if (!entries.has(id)) return Promise.resolve('removed');
      settleDeferredFrame('interrupted'); takeCamera();
      if (followOptions.distance !== undefined) fittedExtent = followExtent(followOptions.distance, store.getSnapshot().settings.zoom, width / height, cameraSettings.fov);
      return new Promise(resolve => { follow = { id, heading: followOptions.heading ?? 'fixed', offset: 0, resolve }; });
    },
    getFollowedNode: () => follow?.id ?? null,
    playCameraPath: path => {
      validateCameraPath(path);
      if (disposed) return { stop: () => undefined, finished: Promise.resolve('interrupted') };
      settleDeferredFrame('interrupted'); takeCamera();
      const start = currentPose(), player = createCameraPathPlayer(path, start, resolveKeyframe); let last: number | null = null;
      const move: CameraMove = { storeZoom: store.getSnapshot().settings.zoom, startExtent: start.extent, resolve: player.finish,
        arrive: pose => arrive(pose, { fittedExtent: pose.extent !== start.extent ? pose.extent : fittedExtent, overviewFit }),
        step: (time, cut) => { const pose = player.advance(last === null ? 0 : (time - last) / 1000, cut); last = time; return { pose, ...(player.result ? { end: player.result } : {}) }; } };
      if (!player.result) transition = move;
      return { stop: () => { if (transition === move) interruptTransition(); else player.finish('interrupted'); }, finished: player.finished };
    },
    getAnchor: (id, name) => { if (disposed) return null; const anchor = entries.get(id)?.object.getObjectByName(`anchor-${name}`); if (!anchor) return null; scene.updateMatrixWorld(true); const rotation = new THREE.Euler().setFromQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())); return { position: anchor.getWorldPosition(new THREE.Vector3()).toArray() as [number, number, number], rotation: [rotation.x, rotation.y, rotation.z] }; },
    setPickTargets: (targets, onPick) => {
      if (disposed) return;
      clearPickTargets();
      if (!targets) return;
      scene.updateMatrixWorld(true);
      const markers = targets.flatMap((target, index): PickTargetMarker[] => {
        const entry = entries.get(target.node), anchor = target.anchor ? entry?.object.getObjectByName(`anchor-${target.anchor}`) : entry?.object;
        return anchor ? [{ index, position: anchor.localToWorld(new THREE.Vector3(...target.offset ?? [0, 0, 0])), quaternion: anchor.getWorldQuaternion(new THREE.Quaternion()), size: target.size }] : [];
      });
      const object = createPickTargetObject(markers);
      pickTargets = { object, targets, ...(onPick ? { onPick } : {}) };
      scene.add(object);
    },
    setOverlay: overlay => { if (disposed) return; const next = overlay ? createOverlayObject(overlay) : null; clearOverlay(); if (next) { overlayObject = next; scene.add(next); } },
    loaded,
    getLoadState: () => loadState,
    overview: (overviewOptions = {}) => {
      if (overviewOptions.transition) validateCameraTransition(overviewOptions.transition);
      if (disposed) return Promise.resolve('interrupted');
      settleDeferredFrame('interrupted'); takeCamera();
      const fit = cameraSettings.overview === 'bounds' ? boundsOverview() : null;
      if (!overviewOptions.transition) {
        fittedExtent = undefined; overviewFit = fit; yaw = cameraSettings.yaw; pitch = cameraSettings.pitch; target.copy(overviewTarget()); store.select(null); options.onSelect?.(null);
        return Promise.resolve('completed');
      }
      store.select(null); options.onSelect?.(null);
      const nodes = store.getSnapshot().nodes;
      return startTransition(() => ({ to: { target: (fit?.target ?? groundTarget(nodes)).toArray(), yaw: cameraSettings.yaw, pitch: cameraSettings.pitch, zoom: store.getSnapshot().settings.zoom, extent: fit?.extent ?? groundExtent(nodes) }, fittedExtent: undefined, overviewFit: fit }), overviewOptions.transition);
    },
    getDiagnostics: () => { const batching = instancing?.stats() ?? { batches: 0, instances: 0 }; return { objects: entries.size, disposed, loaded: loadState.phase === 'loaded', drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, renderedFrames, instanceBatches: batching.batches, instances: batching.instances }; },
    dispose: () => {
      if (disposed || disposing) return; disposing = true;
      // Plugins clean up first, while everything they may hold is still alive.
      const host = plugins; plugins = null; host?.dispose();
      clock.clear(); pendingMove = null; if (options.onPointer) for (const [target, type, listener] of pointerListeners) target.removeEventListener(type, listener as EventListener);
      clearPickTargets(); interruptTransition(); endFollow('stopped'); settleDeferredFrame('interrupted'); cameraListeners.clear(); disposed = true; clearTimeout(sliceTimer); indicator?.dispose(); indicator = null; entries.forEach(entry => entry.controller.cancel('disposed')); clearTimeout(peekTimer); cancelAnimationFrame(raf); observer.disconnect(); unsubscribe(); pan?.dispose(); wheelZoom?.dispose(); container.removeEventListener('pointerleave', leave); labelLayer.removeEventListener('pointermove', onMove); renderer.domElement.removeEventListener('webglcontextlost', onContextLost); if (peekId) { const node = store.getSnapshot().nodes.find(node => node.id === peekId); if (node?.kind === 'asset' && node.view === 'peek') setNodeView(store, peekId, 'closed'); } clearOverlay(); entries.forEach(cleanEntry); entries.clear(); textures.dispose(); glow.dispose(); instancing?.dispose(); disposeObject(grid); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); labelLayer.remove(); },
  };
  if (options.plugins?.length) {
    try {
      plugins = setupRendererPlugins(options.plugins, plugin => ({
        scene, renderer, container, store, loaded, camera: () => camera,
        nodeObject: id => disposed ? null : entries.get(id)?.object ?? null,
        onFrame: api.onFrame, onCameraChange: api.onCameraChange,
        reportError: error => options.onError?.(new Error(`Renderer plugin "${plugin.name}": ${toError(error).message}`, { cause: error })),
      }), error => options.onError?.(error));
    } catch (error) { api.dispose(); throw error; }
  }
  return api;
}

