import * as THREE from 'three';
import { contentsLabel } from '@opsorama/core';
import type { ResolvedTarget, SceneNode, SceneStore, Selection, SceneOverlay } from '@opsorama/core';
import { disposeObject, type AssetRegistry } from './assets';
import { animateAsset } from './animation';
import { createOverlayObject } from './overlay';
import { bindCameraPan } from './camera-pan';
import { bindWheelZoom } from './wheel-zoom';
import { startTransfer, advanceTransfer, type TransferState } from './transfer';
import { createRouteFollower, createControllerSlot, basicControllers, type ControllerContext, type ControllerOutput, type ControllerRegistry, type ControllerSlot, type RouteFollower, type RouteSample } from '@opsorama/core';
import { formatMeasurement } from '@opsorama/core';
import { interiorAreas, isBuilding, isInsideBuilding, isInteriorVisible, isPersonAsset, isWithinInteriorArea, setBuildingView, type InteriorArea } from '@opsorama/core';
import { applyShadowPolicy } from './shadows';
import { mergeStaticParts } from './static-merge';
import { createInstanceBatcher } from './instancing';
import { advanceCornerMarker, createCornerMarker, createGlowHighlight, selectionColor, showCornerMarker, type CornerMarker } from './selection-marker';
import { createMoveTargetObject, highlightMoveTarget, type MoveTargetMarker } from './move-targets';
import { createMarkerElement, MARKER_STYLES } from './markers';
export { createMarkerElement, markerAccessibleName, resolveMarkerAppearance, MARKER_ICON_ELEMENTS, MARKER_SHAPE_GEOMETRY, MARKER_STYLES, type MarkerAppearance } from './markers';
export { sampleRendererFps, type FrameSource, type FpsSamplerOptions } from './fps';
export { createInstanceBatcher, INSTANCING_MIN_COUNT, INSTANCED_BATCH_NAME } from './instancing';
export type { InstanceBatcher, InstancingStats } from './instancing';
export { advanceCornerMarker, createCornerMarker, createGlowHighlight, selectionColor, showCornerMarker } from './selection-marker';
export type { CornerMarker, GlowHighlight, SelectionEmphasis } from './selection-marker';
export { bindMoveMode, createMoveTargetObject, highlightMoveTarget } from './move-targets';
export type { MoveTargetMarker } from './move-targets';
export { createOverlayObject } from './overlay';
export { addObjectRelease, createAssetRegistry, disposeObject } from './assets';
export type { AssetFactory, AssetRegistry, MaterialContext } from './assets';
export { applyShadowPolicy, SHADOW_MIN_WIDTH, SHADOW_CONTAINMENT_TOLERANCE } from './shadows';
export type { ShadowPlacement } from './shadows';
export { animateAsset, setAssetAnimator, hasAssetAnimator, assetAnimatedParts, clearAssetAnimator } from './animation';
export { mergeStaticParts, keepPartsSeparate, MERGED_PART_NAME } from './static-merge';
export type { StaticMergeReport } from './static-merge';
export type { AssetFrame, AssetAnimator } from './animation';
export interface RendererOptions { /** Required. Factories for every `AssetNode.asset` in the scene; the renderer has no built-in models. Use `catalogAssets` from `@opsorama/objects`, your own factories, or both merged with `createAssetRegistry`. An asset name missing from the registry fails with an error when its node is built. A theme or palette change rebuilds every asset node with the new `MaterialContext`. */ assets: AssetRegistry; /** Default true. Draw repeated identical meshes of different nodes as one `InstancedMesh` per batch; false draws every mesh on its own, for comparisons and debugging. Rendering, picking, anchors and bounds are the same either way. Mount-time option: changing it remounts an adapter's renderer. */ instancing?: boolean; /** Default false. Mouse wheel over the canvas and its labels changes `SceneSettings.zoom` around the view centre, within `ZOOM_RANGE`, about 10% per notch. It takes the wheel from the page, so a scene embedded in a scrolling page enables it deliberately; at a zoom bound the wheel scrolls the page again. Hosts observe the change through the store. Mount-time option: changing it remounts an adapter's renderer. */ wheelZoom?: boolean; /** Motion controllers by kind, added to (or overriding) `basicControllers`. */ controllers?: ControllerRegistry; onSelect?: (selection: Selection | null) => void; onError?: (error: Error) => void; }
export interface SceneRenderer { overview(): void; frame(id: string, options?: { fit?: boolean }): void; dispose(): void; /** Current world pose, including instance/parent/rig transforms. Missing or hidden anchors return null. */ getAnchor(id: string, name: string): { position: readonly [number, number, number]; rotation: readonly [number, number, number] } | null; /** Replace the debug overlay (e.g. from `navGraphOverlay`); null removes it. */ setOverlay(overlay: SceneOverlay | null): void; /** Show pickable move targets, positioned once from current anchors; a click on one calls `onPick` instead of selecting. Null removes them. Hosts usually use `bindMoveMode`. */ setMoveTargets(targets: readonly ResolvedTarget[] | null, onPick?: (target: ResolvedTarget) => void): void; getDiagnostics(): { objects: number; disposed: boolean; drawCalls: number; geometries: number; textures: number; /** Completed scene render calls since mount; excludes hidden-document callbacks. */ renderedFrames: number; /** Batches of repeated meshes drawn as one `InstancedMesh` each, and the meshes they draw. */ instanceBatches: number; instances: number }; }
export function createSceneRenderer(container: HTMLElement, store: SceneStore, options: RendererOptions): SceneRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.16;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D operational scene'); renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  // The orthographic near plane lies behind the camera, which stands only 40 m from its target: at low zoom a long scene reaches past it on the camera side.
  const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-20, 20, 12, -12, -150, 150);
  const overviewTarget = () => { const ground = store.getSnapshot().nodes.find(node => node.kind === 'ground'); return new THREE.Vector3(...(ground?.position ?? [0, 0, -.5])).setY(0); };
  const target = overviewTarget(), currentTarget = target.clone(), cameraOffset = new THREE.Vector3(16, 22, 30);
  const ambient = new THREE.HemisphereLight('#f7faff', '#c2ccd9', 2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#ffffff', 2.6); sun.position.set(-12, 25, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -24; sun.shadow.camera.right = 24; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24; sun.shadow.normalBias = .035; scene.add(sun);
  // The frame loop updates world matrices once, before copying them into instance batches.
  scene.matrixWorldAutoUpdate = false; const instancing = options.instancing === false ? null : createInstanceBatcher(scene);
  const grid = new THREE.GridHelper(32, 32, '#9bb2cc', '#b7c8dc'); grid.position.y = .025; scene.add(grid);
  const labelLayer = document.createElement('div'); labelLayer.className = 'kit-scene-labels'; labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  // Marker styles travel with the label layer, so a host needs no stylesheet and disposal removes them.
  const markerStyles = document.createElement('style'); markerStyles.textContent = MARKER_STYLES; labelLayer.append(markerStyles);
  container.append(renderer.domElement, labelLayer);
  const assets = options.assets, controllers: ControllerRegistry = { ...basicControllers, ...options.controllers };
  type Entry = { node: SceneNode; object: THREE.Object3D; target: THREE.Vector3; label: HTMLButtonElement | null; labelHeight: number; /** Model-local bounds of selectable nodes, measured before instance transforms. */ bounds: THREE.Box3 | null; /** Built on first use. */ corners: CornerMarker | null; signature: string; follower: RouteFollower; controller: ControllerSlot; moving: boolean; transfer?: TransferState; /** Fixed per build: parent or carrier chain reaches a building. */ insideBuilding: boolean; /** Current shadow placement, see `applyShadowPolicy`. */ indoor: boolean };
  const glow = createGlowHighlight(scene, mesh => mesh.visible || Boolean(instancing?.isProxy(mesh)));
  let moveTargets: { object: THREE.Group; targets: readonly ResolvedTarget[]; onPick?: (target: ResolvedTarget) => void } | null = null;
  const entries = new Map<string, Entry>(); let width = 1, height = 1, disposed = false, raf = 0, lastTime = 0, animationTime = 0; let hovered: string | null = null; let previousSelection: string | null = store.getSnapshot().selection?.nodeId ?? null;
  let fittedExtent: number | undefined; let shadowExtent = 24; let areas: InteriorArea[] = [];
  const pivot: [number, number, number] = [0, 0, 0];
  // Indoor nodes neither cast nor receive shadows; moving nodes are re-tested every frame against the interior areas.
  const updatePlacements = () => {
    for (const entry of entries.values()) {
      const world = entry.object.matrixWorld.elements; pivot[0] = world[12]; pivot[1] = world[13]; pivot[2] = world[14];
      const indoor = entry.insideBuilding || 'interior' in entry.node && entry.node.interior === true || isWithinInteriorArea(pivot, areas);
      if (indoor !== entry.indoor) { entry.indoor = indoor; applyShadowPolicy(entry.object, { interior: indoor }); instancing?.refresh(entry.object); }
    }
  };
  let pan: ReturnType<typeof bindCameraPan> | undefined = undefined;
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const projected = new THREE.Vector3(); const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Child nodes own their resources independently of their container's shell.
  const cleanEntry = (entry: Entry) => { for (const child of entries.values()) if (child !== entry) { let parent = child.object.parent; while (parent && parent !== entry.object) parent = parent.parent; if (parent) child.object.removeFromParent(); } entry.object.removeFromParent(); entry.label?.remove(); instancing?.remove(entry.object); disposeObject(entry.object); };
  function build(node: SceneNode): THREE.Object3D {
    if (node.kind === 'asset') {
      if (!Object.hasOwn(assets, node.asset)) throw new Error(`Unknown asset: ${node.asset}. Add its AssetFactory to the renderer's assets option, for example catalogAssets from @opsorama/objects.`);
      return assets[node.asset](node, { theme: store.getSnapshot().settings.theme, palette: store.getSnapshot().settings.palette });
    }
    if (node.kind === 'marker') return new THREE.Group();
    if (node.kind === 'ground' || node.kind === 'zone') {
      const group = new THREE.Group(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(node.size[0], node.kind === 'ground' ? .18 : .08, node.size[1]), new THREE.MeshStandardMaterial({ color: node.color || (node.kind === 'ground' ? '#e7eef8' : '#dce9f6'), roughness: .92 })); mesh.position.y = node.kind === 'ground' ? -.13 : .055; mesh.receiveShadow = true; group.add(mesh);
      if (node.kind === 'zone') { const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9 })); edges.position.copy(mesh.position); group.add(edges); }
      return group;
    }
    const group = new THREE.Group();
    for (let i = 0; i < node.points.length - 1; i++) {
      const a = new THREE.Vector3(...node.points[i]), b = new THREE.Vector3(...node.points[i + 1]); const length = a.distanceTo(b);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(.48, .12, length), new THREE.MeshStandardMaterial({ color: node.color || '#a9bcd4', roughness: .9 })); belt.position.copy(a).lerp(b, .5); belt.position.y += .12; belt.lookAt(b.x, belt.position.y, b.z); belt.receiveShadow = true; group.add(belt);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().add(new THREE.Vector3(0, .195, 0)), b.clone().add(new THREE.Vector3(0, .195, 0))]), new THREE.LineDashedMaterial({ color: '#f8fbff', dashSize: .15, gapSize: .15 })); line.computeLineDistances(); group.add(line);
    } return group;
  }
  function sync() {
    const snapshot = store.getSnapshot();
    scene.background = new THREE.Color(snapshot.settings.theme === 'midnight' ? '#17243b' : '#edf2fa'); ambient.intensity = snapshot.settings.theme === 'midnight' ? 1.05 : 2;
    grid.visible = snapshot.settings.grid; renderer.shadowMap.enabled = snapshot.settings.shadows;
    labelLayer.dataset.motion = snapshot.settings.motion && !snapshot.settings.paused ? 'on' : 'off';
    const nextShadowExtent = snapshot.nodes.reduce((extent, node) => node.kind === 'ground' ? Math.max(extent, node.size[0] / 2, node.size[1] / 2) : extent, 24);
    if (nextShadowExtent !== shadowExtent) { shadowExtent = nextShadowExtent; sun.shadow.camera.left = -shadowExtent; sun.shadow.camera.right = shadowExtent; sun.shadow.camera.top = shadowExtent; sun.shadow.camera.bottom = -shadowExtent; sun.shadow.camera.updateProjectionMatrix(); }
    const byId = new Map(snapshot.nodes.map(node => [node.id, node])); areas = interiorAreas(snapshot.nodes);
    const visibleNodes = snapshot.nodes.filter(node => isInteriorVisible(node, snapshot.nodes, byId));
    const ids = new Set(visibleNodes.map(n => n.id)); for (const [id, entry] of entries) if (!ids.has(id)) { entry.controller.cancel('removed'); cleanEntry(entry); entries.delete(id); }
    const built: Entry[] = [], style = snapshot.settings.selectionStyle;
    for (const node of visibleNodes) {
      // Placement is part of the signature: a carried node follows its carrier into or out of a building.
      const insideBuilding = isInsideBuilding(node, byId), signature = JSON.stringify({ ...node, position: undefined, route: undefined, insideBuilding, ...(node.kind === 'marker' ? { materialPalette: snapshot.settings.palette } : {}), ...(node.kind === 'asset' ? { paletteTheme: snapshot.settings.theme, materialPalette: snapshot.settings.palette } : {}) }); let entry = entries.get(node.id);
      if (!entry || entry.signature !== signature) {
        // Narrow shadows per part first, then merge static parts grouped by the decided flags.
        const object = build(node); applyShadowPolicy(object, { interior: insideBuilding }); mergeStaticParts(object);
        // Measure before instance transforms; projected anchors below are in object-local coordinates.
        const labelHeight = node.kind === 'marker' ? 0 : isBuilding(node) ? (node.building?.size?.[1] ?? 3.6) + .4 : node.kind === 'asset' && (node.surfaceLabel || node.measurement) ? new THREE.Box3().setFromObject(object).max.y + .35 : node.kind === 'asset' && isPersonAsset(node.asset) ? 2.15 : 1.65;
        const bounds = node.kind !== 'marker' && (node.entityId || node.selectable) ? new THREE.Box3().setFromObject(object) : null;
        const sameParent = JSON.stringify(entry?.node.attachment) === JSON.stringify(node.attachment) && entry?.node.parentId === node.parentId;
        const oldPosition = sameParent ? entry?.object.position.clone() : undefined, oldYaw = entry?.follower.route || entry?.controller.active ? entry.object.rotation.y : undefined;
        // A transfer starts from the last rendered world pose; the old parent may already have been rebuilt in this sync.
        const transfer = entry && !sameParent && node.kind === 'asset' && node.transfer ? startTransfer(entry.object, node.transfer) : undefined;
        if (entry) cleanEntry(entry);
        object.position.set(...(node.position || [0, 0, 0])); if (oldPosition) object.position.copy(oldPosition);
        if (node.rotation) object.rotation.set(...node.rotation); if (oldYaw !== undefined) object.rotation.y = oldYaw; if (node.scale) object.scale.set(...node.scale);
        object.traverse(child => { child.userData.nodeId = node.id; });
        let label: HTMLButtonElement | null = null;
        const text = node.kind === 'asset' && node.contents ? `${node.label ? `${node.label} · ` : ''}${contentsLabel(node.contents, node.asset === 'shopping-cart' ? 6 : 9)}` : node.label ?? (node.kind === 'asset' && node.measurement ? formatMeasurement(node.measurement) : undefined);
        if (node.kind === 'marker') { label = createMarkerElement(node, snapshot.settings.palette); label.dataset.nodeId = node.id; if (node.entityId || node.selectable) label.addEventListener('click', () => select(node.id, 'keyboard')); labelLayer.append(label); }
        else if (text) { label = document.createElement('button'); label.className = `kit-node-label${node.kind === 'zone' ? ' kit-zone-label' : ''}${node.state === 'warning' ? ' kit-node-warning' : ''}`; if (node.kind === 'asset' && node.measurement) label.style.cssText = 'max-width:220px;white-space:normal;overflow-wrap:anywhere;'; const content = document.createElement('span'); content.className = 'kit-node-label-text'; content.textContent = text; label.append(content); label.setAttribute('aria-label', `Select ${text}`); label.dataset.nodeId = node.id; label.addEventListener('click', () => select(node.id, 'keyboard')); labelLayer.append(label); if (!node.entityId && !node.selectable) { label.disabled = true; label.style.pointerEvents = 'none'; } }
        // Keep quantity/record markers above models that have their own surface artwork.
        entry = { node, object, target: new THREE.Vector3(...(node.position || [0, 0, 0])), bounds, corners: null, label, labelHeight, signature, follower: entry?.follower ?? createRouteFollower(), controller: entry?.controller ?? createControllerSlot(), moving: false, insideBuilding, indoor: insideBuilding, ...(transfer ? { transfer } : {}) }; entries.set(node.id, entry); scene.add(object); built.push(entry);
      }
      entry.node = node; entry.target.set(...(node.position || [0, 0, 0]));
      const route = node.kind === 'asset' ? node.route : undefined, wasFollowing = entry.follower.route !== null;
      // A replacement joins from the follower's own pose, not the smoothed object position, so visual timing matches the simulation.
      entry.follower.assign(route, entry.follower.sample()?.position ?? entry.object.position.toArray());
      // A controller starts from the current visual pose and keeps it across model rebuilds; a failing spec is reported, not retried.
      const wasControlled = entry.controller.active;
      if (node.kind === 'asset') try { entry.controller.assign(node, controllers); } catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); }
      if (!route && !entry.controller.active && (snapshot.settings.paused || !snapshot.settings.motion || reducedMotion.matches)) entry.object.position.copy(entry.target);
      if ((wasFollowing || wasControlled) && !route && !entry.controller.active) { entry.moving = false; entry.object.rotation.set(...(node.rotation || [0, 0, 0])); }
      const emphasis = snapshot.selection?.nodeId === node.id ? 'selected' : hovered === node.id ? 'hovered' : null;
      if (style === 'corners' && emphasis && entry.bounds && !entry.corners) { entry.corners = createCornerMarker(entry.bounds, typeof entry.object.userData.surfaceLevel === 'number' ? entry.object.userData.surfaceLevel : 0); entry.object.add(entry.corners.object); }
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
    // Register new objects once their world matrices and shadow placement are current.
    scene.updateMatrixWorld(true); updatePlacements(); for (const entry of built) instancing?.add(entry.object);
    const selectedId = snapshot.selection?.nodeId || null;
    for (const [emphasis, id] of [['selected', selectedId], ['hovered', hovered === selectedId ? null : hovered]] as const) { const entry = id ? entries.get(id) : undefined; glow.show(emphasis, style === 'glow' && entry?.bounds ? entry.object : null, selectionColor(entry?.node.state, snapshot.settings.palette)); }
    if (selectedId !== previousSelection) { previousSelection = selectedId; if (selectedId) frame(selectedId); else { pan?.cancel(); target.copy(overviewTarget()); } }
  }
  const safeSync = () => { try { sync(); } catch (error) { options.onError?.(error instanceof Error ? error : new Error(String(error))); } };
  const unsubscribe = store.subscribe(safeSync);
  try { sync(); } catch (error) { unsubscribe(); entries.forEach(cleanEntry); glow.dispose(); instancing?.dispose(); disposeObject(grid); sun.shadow.dispose(); renderer.dispose(); container.replaceChildren(); throw error; }
  const resize = () => { pan?.cancel(); const bounds = container.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); renderer.setSize(width, height, false); camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function frame(id: string, options?: { fit?: boolean }) { const entry = entries.get(id); if (entry) { pan?.cancel(); if (options?.fit) { const bounds = new THREE.Box3().setFromObject(entry.object), size = bounds.getSize(new THREE.Vector3()), direction = cameraOffset.clone().normalize(), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize(), up = direction.clone().cross(right); const span = (axis: THREE.Vector3) => Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z; fittedExtent = Math.max(.3, (span(right) + 4) / 34, (span(up) + 4) / 21) * store.getSnapshot().settings.zoom; target.copy(bounds.getCenter(new THREE.Vector3())); currentTarget.copy(target); } else { target.copy(entry.object.getWorldPosition(new THREE.Vector3())).multiplyScalar(fittedExtent === undefined ? .48 : 1).setY(0); } } }
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
  function select(id: string | null, origin: Selection['origin']) { store.select(id, origin); if (id) frame(id); else target.copy(overviewTarget()); options.onSelect?.(store.getSnapshot().selection); }
  const aim = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1); raycaster.setFromCamera(pointer, camera); };
  /** Index of the move target under the pointer, nearest first, or null. */
  function moveTargetAt(event: PointerEvent): number | null {
    if (!moveTargets) return null;
    aim(event);
    const hit = raycaster.intersectObjects(moveTargets.object.children, false)[0];
    return hit ? hit.object.userData.moveTarget as number : null;
  }
  function pick(event: PointerEvent) {
    aim(event);
    const hits = raycaster.intersectObjects([...entries.values()].filter(e => !e.node.parentId && !e.node.attachment).map(e => e.object), true).filter(hit => hit.object instanceof THREE.Mesh && (hit.object.visible || instancing?.isProxy(hit.object)));
    const id = hits[0]?.object.userData.nodeId as string | undefined, node = id ? entries.get(id)?.node : undefined;
    return node && (node.entityId || node.selectable) ? id : undefined;
  }
  let peekId: string | null = null, pendingPeek: string | null = null, peekTimer: ReturnType<typeof setTimeout> | undefined;
  function changePeek(next: string | null) {
    if (next === pendingPeek) return;
    pendingPeek = next; clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (disposed) return;
      if (peekId && peekId !== next) {
        const old = store.getSnapshot().nodes.find(node => node.id === peekId);
        if (isBuilding(old) && old.building?.view === 'peek') setBuildingView(store, peekId, 'closed');
      }
      peekId = next;
      const node = next ? store.getSnapshot().nodes.find(node => node.id === next) : undefined;
      if (isBuilding(node) && (node.building?.view ?? 'closed') === 'closed') setBuildingView(store, node.id, 'peek');
    }, next ? 160 : 280);
  }
  function hoveredBuilding(): string | null {
    let closest = Infinity, result: string | null = null;
    for (const entry of entries.values()) {
      if (!isBuilding(entry.node) || !entry.node.building?.peekOnHover) continue;
      const bounds = entry.object.userData.buildingBounds as THREE.Box3 | undefined;
      if (!bounds) continue;
      const ray = raycaster.ray.clone().applyMatrix4(entry.object.matrixWorld.clone().invert());
      const point = ray.intersectBox(bounds, new THREE.Vector3());
      if (!point) continue;
      const distance = point.applyMatrix4(entry.object.matrixWorld).distanceTo(raycaster.ray.origin);
      if (distance < closest) { closest = distance; result = entry.node.id; }
    }
    return result;
  }
  const onClick = (event: PointerEvent) => {
    const index = moveTargetAt(event);
    if (index !== null) { moveTargets!.onPick?.(moveTargets!.targets[index]); return; }
    select(pick(event) || null, 'pointer');
  };
  const onMove = (event: PointerEvent) => {
    if (moveTargets) {
      const index = moveTargetAt(event);
      highlightMoveTarget(moveTargets.object, index);
      if (index !== null) { renderer.domElement.style.cursor = 'pointer'; return; }
    }
    const labelId = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-node-id]')?.dataset.nodeId : undefined;
    const picked = pick(event), next = labelId || picked || null;
    // Floating interior labels are part of the inspection region too.
    let labelNode = labelId ? entries.get(labelId)?.node : undefined;
    while (labelNode && !isBuilding(labelNode)) labelNode = labelNode.parentId ? entries.get(labelNode.parentId)?.node : undefined;
    if (event.pointerType === 'mouse') changePeek(isBuilding(labelNode) && labelNode.building?.peekOnHover ? labelNode.id : hoveredBuilding());
    renderer.domElement.style.cursor = next ? 'pointer' : 'grab'; if (next !== hovered) { hovered = next; safeSync(); }
  };
  const leave = () => { changePeek(null); if (hovered) { hovered = null; safeSync(); } };
  container.addEventListener('pointerleave', leave); labelLayer.addEventListener('pointermove', onMove);
  pan = bindCameraPan(renderer.domElement, camera, { getTarget: () => currentTarget, setTarget: value => { changePeek(null); target.copy(value); currentTarget.copy(value); if (hovered) { hovered = null; safeSync(); } }, onClick, onHover: onMove });
  const wheelZoom = options.wheelZoom ? bindWheelZoom([renderer.domElement, labelLayer], { getZoom: () => store.getSnapshot().settings.zoom, setZoom: zoom => store.configure({ zoom }) }) : null;
  const onContextLost = (event: Event) => { event.preventDefault(); pan?.cancel(); cancelAnimationFrame(raf); options.onError?.(new Error('Graphics context lost. Reload the scene to recover; records remain available in the host HTML view.')); };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  let renderedFrames = 0;
  function animate(time: number) {
    if (disposed) return; const dt = Math.min(.05, lastTime ? (time - lastTime) / 1000 : .016); lastTime = time; const settings = store.getSnapshot().settings;
    if (!document.hidden) {
      const extent = fittedExtent ?? store.getSnapshot().nodes.reduce((value, node) => node.kind === 'ground' ? Math.max(value, node.size[0] / 32, node.size[1] / 19) : value, 1);
      currentTarget.lerp(target, reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 5)); camera.position.copy(currentTarget).add(cameraOffset); camera.lookAt(currentTarget); camera.zoom = Math.min(width / (34 * extent), height / (21 * extent)) * settings.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const animated = settings.motion && !reducedMotion.matches;
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
      } if (areas.length) updatePlacements(); scene.updateMatrixWorld(); instancing?.update(); glow.update(time / 1000, animated && !settings.paused); renderer.render(scene, camera); renderedFrames++;
    } raf = requestAnimationFrame(animate);
  }
  raf = requestAnimationFrame(animate);
  let overlayObject: THREE.Object3D | null = null;
  const clearMoveTargets = () => { if (moveTargets) { scene.remove(moveTargets.object); disposeObject(moveTargets.object); moveTargets = null; } };
  const clearOverlay = () => { if (overlayObject) { scene.remove(overlayObject); disposeObject(overlayObject); overlayObject = null; } };
  return {
    frame,
    getAnchor: (id, name) => { if (disposed) return null; const anchor = entries.get(id)?.object.getObjectByName(`anchor-${name}`); if (!anchor) return null; scene.updateMatrixWorld(true); const rotation = new THREE.Euler().setFromQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())); return { position: anchor.getWorldPosition(new THREE.Vector3()).toArray() as [number, number, number], rotation: [rotation.x, rotation.y, rotation.z] }; },
    setMoveTargets: (targets, onPick) => {
      if (disposed) return;
      clearMoveTargets();
      if (!targets) return;
      scene.updateMatrixWorld(true);
      const markers = targets.flatMap((target, index): MoveTargetMarker[] => {
        const { container, anchor: name, offset } = target.placement, entry = entries.get(container);
        const anchor = name ? entry?.object.getObjectByName(`anchor-${name}`) : entry?.object;
        return anchor ? [{ index, position: anchor.localToWorld(new THREE.Vector3(...offset)), quaternion: anchor.getWorldQuaternion(new THREE.Quaternion()), size: target.size }] : [];
      });
      const object = createMoveTargetObject(markers);
      moveTargets = { object, targets, ...(onPick ? { onPick } : {}) };
      scene.add(object);
    },
    setOverlay: overlay => { if (disposed) return; const next = overlay ? createOverlayObject(overlay) : null; clearOverlay(); if (next) { overlayObject = next; scene.add(next); } },
    overview: () => { fittedExtent = undefined; pan?.cancel(); target.copy(overviewTarget()); store.select(null); options.onSelect?.(null); },
    getDiagnostics: () => { const batching = instancing?.stats() ?? { batches: 0, instances: 0 }; return { objects: entries.size, disposed, drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, renderedFrames, instanceBatches: batching.batches, instances: batching.instances }; },
    dispose: () => { if (disposed) return; clearMoveTargets(); disposed = true; entries.forEach(entry => entry.controller.cancel('disposed')); clearTimeout(peekTimer); cancelAnimationFrame(raf); observer.disconnect(); unsubscribe(); pan?.dispose(); wheelZoom?.dispose(); container.removeEventListener('pointerleave', leave); labelLayer.removeEventListener('pointermove', onMove); renderer.domElement.removeEventListener('webglcontextlost', onContextLost); if (peekId) { const node = store.getSnapshot().nodes.find(node => node.id === peekId); if (isBuilding(node) && node.building?.view === 'peek') setBuildingView(store, peekId, 'closed'); } clearOverlay(); entries.forEach(cleanEntry); entries.clear(); glow.dispose(); instancing?.dispose(); disposeObject(grid); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); labelLayer.remove(); },
  };
}

