import * as THREE from 'three';
import { isBuilding, type SceneNode, type SceneStore } from '@opsorama/core';
import { disposeObject, type AssetRegistry } from './assets';
import { animateAsset } from './animation';
import { buildPrimitive } from './primitives';

/** Default `NodePreviewOptions.maxNodes`: the copied node plus at most 239 visible descendants. */
export const NODE_PREVIEW_MAX_NODES = 240;
/** Default `NodePreviewOptions.spin`: turntable speed in radians per second, one turn in about 16 seconds. */
export const NODE_PREVIEW_SPIN = .4;

/**
 * The nodes a preview of `rootId` draws, in build order (each owner before the nodes it carries or contains).
 * The copy holds the root node and every descendant that is visible in the scene: attached nodes always, and
 * `parentId` children only while their building container is open or peeking, as `isInteriorVisible` decides.
 * Marker nodes have no geometry and are left out, with their descendants. The root copy sits at the origin
 * without its own `parentId`, `attachment`, route, controller or transfer; descendants keep their local placement
 * but lose routes, controllers and transfers, so nothing travels inside the preview. Returns an empty list when
 * the node is missing or is a marker. At most `maxNodes` nodes are returned, nearest descendants first.
 */
export function previewNodes(nodes: readonly SceneNode[], rootId: string, maxNodes = NODE_PREVIEW_MAX_NODES): SceneNode[] {
  const root = nodes.find(node => node.id === rootId);
  if (!root || root.kind === 'marker' || maxNodes < 1) return [];
  const owned = new Map<string, SceneNode[]>();
  for (const node of nodes) {
    const owner = node.attachment?.nodeId ?? node.parentId;
    if (owner === undefined || node.kind === 'marker') continue;
    const list = owned.get(owner); if (list) list.push(node); else owned.set(owner, [node]);
  }
  const strip = (node: SceneNode): SceneNode => {
    const copy = { ...node };
    if (copy.kind === 'asset') { delete copy.route; delete copy.controller; delete copy.transfer; }
    return copy;
  };
  const placedRoot = { ...strip(root), position: [0, 0, 0] } as SceneNode; delete placedRoot.parentId; delete placedRoot.attachment;
  const result: SceneNode[] = [placedRoot], seen = new Set([root.id]);
  for (let index = 0; index < result.length && result.length < maxNodes; index++) {
    const owner = result[index];
    for (const child of owned.get(owner.id) ?? []) {
      if (seen.has(child.id) || result.length >= maxNodes) continue;
      // `parentId` places a node inside a building; a closed building hides it, as in the scene.
      if (!child.attachment && (!isBuilding(owner) || (owner.building?.view ?? 'closed') === 'closed')) continue;
      seen.add(child.id); result.push(strip(child));
    }
  }
  return result;
}

export interface NodePreviewOptions {
  /** Required. Factories for every asset in the copied nodes; pass the registry of the scene renderer, for example `catalogAssets` from `@opsorama/objects`. */
  assets: AssetRegistry;
  /** Default null (empty preview). The scene node to copy; change it later with `NodePreview.setNode`. A missing node or a marker shows nothing until it appears. */
  nodeId?: string | null;
  /** Default `NODE_PREVIEW_SPIN` (0.4). Turntable speed in radians per second while scene motion runs; 0 keeps the copy facing the scene camera. Motion off, pause and reduced motion stop it. Mount-time. */
  spin?: number;
  /** Default `NODE_PREVIEW_MAX_NODES` (240). Most nodes copied, root included; see `previewNodes`. Mount-time. */
  maxNodes?: number;
  /** A model failed to build or the graphics context was lost. The preview stays empty until the next change. */
  onError?: (error: Error) => void;
}

export interface NodePreviewState {
  /** The node the preview copies, or null. */
  nodeId: string | null;
  /** Nodes in the current copy; 0 when there is nothing to draw. */
  nodes: number;
  /** Completed render calls since mount. */
  renderedFrames: number;
  disposed: boolean;
}

export interface NodePreview {
  /** Copy another node, or null for an empty preview. */
  setNode(id: string | null): void;
  getState(): NodePreviewState;
  /** Releases the canvas, GPU resources, listeners and the store subscription. Safe to call twice. */
  dispose(): void;
}

const CAMERA_DIRECTION = new THREE.Vector3(16, 22, 30).normalize();
const FIELD_OF_VIEW = 30;

/**
 * A live copy of one scene node and its visible descendants in its own small canvas, for an inspector or detail panel.
 * It reads the same store as the scene: state, count, materials, theme and palette changes rebuild the copy, and built-in
 * model animation follows the scene's motion, pause, speed and reduced-motion settings. The copy turns slowly on a
 * turntable; dragging horizontally or the left and right arrow keys turn it by hand. It neither selects nor changes the
 * store. The canvas is transparent, so the host panel supplies the background. Each preview owns one WebGL context and
 * draws only while something moves; create one per panel, not one per list row.
 */
export function createNodePreview(container: HTMLElement, store: SceneStore, options: NodePreviewOptions): NodePreview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.16;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  container.append(canvas);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, .05, 100);
  const ambient = new THREE.HemisphereLight('#f7faff', '#c2ccd9', 2), sun = new THREE.DirectionalLight('#ffffff', 2.6); sun.position.set(-12, 25, 16);
  // The turntable turns around the vertical axis through the centre of the copy's bounds.
  const turntable = new THREE.Group(), holder = new THREE.Group(); turntable.add(holder); scene.add(ambient, sun, turntable);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const spin = options.spin ?? NODE_PREVIEW_SPIN, maxNodes = options.maxNodes ?? NODE_PREVIEW_MAX_NODES;
  let nodeId = options.nodeId ?? null, signature = '', builtFor: string | null = null, built: { node: SceneNode; object: THREE.Object3D }[] = [], radius = 0;
  let width = 1, height = 1, raf = 0, lastTime = 0, animationTime = 0, renderedFrames = 0, disposed = false, drag: { pointer: number; x: number } | null = null;
  const report = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)));
  const animated = () => { const settings = store.getSnapshot().settings; return settings.motion && !settings.paused && !reducedMotion.matches; };
  const clear = () => { for (const { object } of built) { object.removeFromParent(); disposeObject(object); } built = []; radius = 0; };

  function build(nodes: readonly SceneNode[]) {
    const { theme, palette } = store.getSnapshot().settings, objects = new Map<string, THREE.Object3D>();
    for (const node of nodes) {
      if (node.kind === 'marker') continue;
      if (node.kind === 'asset' && !Object.hasOwn(options.assets, node.asset)) throw new Error(`Unknown asset: ${node.asset}. Pass the scene renderer's asset registry to the preview, for example catalogAssets from @opsorama/objects.`);
      const object = node.kind === 'asset' ? options.assets[node.asset](node, { theme, palette }) : buildPrimitive(node);
      built.push({ node, object });
      object.position.set(...(node.position ?? [0, 0, 0])); if (node.rotation) object.rotation.set(...node.rotation); if (node.scale) object.scale.set(...node.scale);
      const ownerId = node.attachment?.nodeId ?? node.parentId, owner = ownerId === undefined ? undefined : objects.get(ownerId);
      const parent = !owner ? holder : node.attachment?.anchor ? owner.getObjectByName(`anchor-${node.attachment.anchor}`) : owner;
      if (!parent) throw new Error(`Unknown attachment anchor ${node.attachment?.anchor} on ${ownerId}.`);
      parent.add(object); objects.set(node.id, object);
    }
    // Centre the copy on the turntable and fit its bounding sphere, which stays in view at every turntable angle.
    holder.position.set(0, 0, 0); turntable.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(holder);
    if (bounds.isEmpty()) return;
    const centre = bounds.getCenter(new THREE.Vector3()); holder.position.set(-centre.x, -centre.y, -centre.z);
    radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, .05);
  }

  function frameCamera() {
    if (!radius) return;
    const vertical = THREE.MathUtils.degToRad(FIELD_OF_VIEW) / 2, horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.06;
    camera.position.copy(CAMERA_DIRECTION).multiplyScalar(distance); camera.near = Math.max(.01, distance - radius * 1.5); camera.far = distance + radius * 1.5;
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  }

  function sync() {
    const snapshot = store.getSnapshot(), nodes = nodeId ? previewNodes(snapshot.nodes, nodeId, maxNodes) : [];
    const root = nodes[0], next = JSON.stringify([nodes, snapshot.settings.theme, snapshot.settings.palette]);
    const label = root ? root.label ?? (root.kind === 'asset' ? root.asset : root.id) : null;
    canvas.setAttribute('aria-label', label ? `3D copy of ${label}. Use the left and right arrow keys to turn it.` : 'Empty 3D preview');
    if (next !== signature) {
      signature = next; clear();
      ambient.intensity = snapshot.settings.theme === 'midnight' ? 1.05 : 2;
      // A new node starts facing the scene camera; a rebuild of the same node keeps the turntable angle.
      if (builtFor !== nodeId) { builtFor = nodeId; turntable.rotation.y = 0; }
      try { build(nodes); } catch (error) { clear(); report(error); }
      frameCamera();
    }
    request();
  }

  function request() { if (!raf && !disposed) raf = requestAnimationFrame(draw); }
  function draw(time: number) {
    raf = 0; if (disposed) return;
    const delta = Math.min(.05, lastTime ? (time - lastTime) / 1000 : .016), moving = animated() && built.length > 0; lastTime = time;
    if (moving) {
      const speed = store.getSnapshot().settings.speed; animationTime += delta * speed;
      if (!drag) turntable.rotation.y += spin * delta;
      for (const { node, object } of built) if (node.kind !== 'asset' || node.localMotion !== false) animateAsset(object, { time: animationTime, delta: delta * speed });
    }
    turntable.updateMatrixWorld(true); renderer.render(scene, camera); renderedFrames++;
    // Without motion the preview draws once per change; the next frame starts from a fresh clock.
    if (moving || drag) request(); else lastTime = 0;
  }

  const resize = () => { const rect = container.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); renderer.setSize(width, height, false); camera.aspect = width / height; frameCamera(); request(); };
  const observer = new ResizeObserver(resize); observer.observe(container);
  const turn = (radians: number) => { turntable.rotation.y += radians; request(); };
  const onPointerDown = (event: PointerEvent) => { if (event.button !== 0) return; drag = { pointer: event.pointerId, x: event.clientX }; canvas.setPointerCapture?.(event.pointerId); canvas.style.cursor = 'grabbing'; };
  const onPointerMove = (event: PointerEvent) => { if (drag?.pointer !== event.pointerId) return; turn((event.clientX - drag.x) * Math.PI / Math.max(width, 160)); drag.x = event.clientX; };
  const onPointerUp = (event: PointerEvent) => { if (drag?.pointer !== event.pointerId) return; drag = null; canvas.releasePointerCapture?.(event.pointerId); canvas.style.cursor = 'grab'; request(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); turn(event.key === 'ArrowLeft' ? -Math.PI / 12 : Math.PI / 12); } };
  const onContextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(raf); raf = 0; report(new Error('Graphics context lost in the 3D preview. Reopen the panel to recover.')); };
  const onMotionPreference = () => request();
  canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('keydown', onKey); canvas.addEventListener('webglcontextlost', onContextLost); reducedMotion.addEventListener('change', onMotionPreference);
  const unsubscribe = store.subscribe(sync);
  resize(); sync();

  return {
    setNode(id) { if (disposed || id === nodeId) return; nodeId = id; sync(); },
    getState: () => ({ nodeId, nodes: built.length, renderedFrames, disposed }),
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); unsubscribe(); observer.disconnect(); reducedMotion.removeEventListener('change', onMotionPreference);
      canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('keydown', onKey); canvas.removeEventListener('webglcontextlost', onContextLost);
      clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
