import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialOverrides, VisualState } from '@opsorama/core';

/** Why a node is marked: `selected` is the store selection, `hovered` the node under the pointer. */
export type SelectionEmphasis = 'selected' | 'hovered';

/** Marker color: palette `critical`/`warning` for those node states, palette `accent` otherwise, with fixed fallbacks. */
export function selectionColor(state: VisualState | undefined, palette: MaterialOverrides | undefined): string {
  if (state === 'critical') return palette?.critical ?? '#d9483b';
  if (state === 'warning') return palette?.warning ?? '#daa13c';
  return palette?.accent ?? '#4779ed';
}

/** World-unit gap between the model bounds and the brackets. */
const CORNER_MARGIN = .22;
/** Bracket height above the node's base in world units, just above the top of a zone (.095). */
const CORNER_LIFT = .11;
/** Smallest bracket width/depth in world units, so tiny models keep a readable marker. */
const CORNER_MIN_SPAN = .8;
/** Scale added at the start of the selection animation; 0 is the resting size. */
const CORNER_SETTLE_SCALE = .22;
/** Exponential decay rate of the selection animation, per second. */
const CORNER_SETTLE_RATE = 12;

/** Corner brackets around a node's footprint. Owned by the node object: `disposeObject` releases them. */
export interface CornerMarker {
  object: THREE.Group;
  /** 1 at the start of the selection animation, 0 at rest. */
  settle: number;
  emphasis: SelectionEmphasis | null;
  brackets: THREE.MeshBasicMaterial;
  pad: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

function bracketGeometry(width: number, depth: number): THREE.BufferGeometry {
  const thickness = THREE.MathUtils.clamp(Math.max(width, depth) * .035, .09, .2);
  const arm = THREE.MathUtils.clamp(Math.min(width, depth) * .34, thickness * 3, 2), round = thickness * 1.2;
  const shape = new THREE.Shape().moveTo(arm, 0).lineTo(arm, thickness).lineTo(thickness, thickness).lineTo(thickness, arm).lineTo(0, arm).lineTo(0, round).quadraticCurveTo(0, 0, round, 0).closePath();
  const corner = new THREE.ShapeGeometry(shape, 6).rotateX(Math.PI / 2);
  const corners = [-1, 1].flatMap(x => [-1, 1].map(z => corner.clone().scale(-x, 1, -z).translate(x * width / 2, 0, z * depth / 2)));
  const merged = mergeGeometries(corners)!;
  corner.dispose(); corners.forEach(geometry => geometry.dispose());
  return merged;
}

/**
 * Build hidden brackets for model-local `bounds` (an empty box gets the minimum span) at height `level`.
 * Brackets and pad are depth tested, so the node itself or anything in front of it hides the corners it covers.
 * Neither part takes part in picking. Add `object` to the node object so it follows moves, rotation and scale.
 */
export function createCornerMarker(bounds: THREE.Box3, level: number): CornerMarker {
  const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3()), center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const width = Math.max(CORNER_MIN_SPAN, size.x + CORNER_MARGIN * 2), depth = Math.max(CORNER_MIN_SPAN, size.z + CORNER_MARGIN * 2);
  const object = new THREE.Group(); object.name = 'selection-corners'; object.position.set(center.x, level + CORNER_LIFT, center.z); object.visible = false;
  const brackets = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lines = new THREE.Mesh(bracketGeometry(width, depth), brackets); lines.renderOrder = 10; lines.raycast = () => {};
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .14, depthWrite: false, toneMapped: false })); pad.raycast = () => {};
  object.add(pad, lines);
  return { object, settle: 0, emphasis: null, brackets, pad };
}

/** Apply the emphasis (null hides the marker) and color. Becoming selected restarts the selection animation. */
export function showCornerMarker(marker: CornerMarker, emphasis: SelectionEmphasis | null, color: string): void {
  if (emphasis === 'selected' && marker.emphasis !== 'selected') marker.settle = 1;
  marker.emphasis = emphasis; marker.object.visible = emphasis !== null;
  marker.brackets.color.set(color); marker.brackets.opacity = emphasis === 'selected' ? 1 : .6;
  marker.pad.material.color.set(color); marker.pad.visible = emphasis === 'selected';
}

/** Advance the selection animation by `delta` seconds; `Infinity` finishes it for motion-off, paused and reduced motion. */
export function advanceCornerMarker(marker: CornerMarker, delta: number): void {
  if (!marker.settle) return;
  marker.settle = delta === Infinity || marker.settle < .002 ? 0 : marker.settle * Math.exp(-delta * CORNER_SETTLE_RATE);
  const scale = 1 + CORNER_SETTLE_SCALE * marker.settle; marker.object.scale.set(scale, 1, scale);
}

/** Tint opacity of a hovered node, and of a selected node while the pulse is off. */
const GLOW_OPACITY: Readonly<Record<SelectionEmphasis, number>> = Object.freeze({ selected: .46, hovered: .24 });
/** Peak opacity added by the selected pulse. */
const GLOW_PULSE = .16;
/** Share of white mixed into the color, so a tint still shows on a model of the same hue. */
const GLOW_LIGHTEN = .3;
/** Pulse speed in radians per second. */
const GLOW_PULSE_RATE = 3;

const WHITE = new THREE.Color('#ffffff');

interface GlowShell { mesh: THREE.Mesh; source: THREE.Mesh; }
interface GlowSlot { object: THREE.Object3D | null; shells: GlowShell[]; material: THREE.MeshBasicMaterial; }

/**
 * Tints one selected and one hovered node with a colored shell over each opaque mesh.
 * Shells share the source geometry and leave model materials untouched, so state colors, merged parts and
 * instanced proxies keep working. Shells are not children of the model because proxies are hidden; `update`
 * copies the source world matrices each frame. A rebuilt model is a new object: call `show` again.
 */
export interface GlowHighlight {
  /** Mark `object` for this emphasis, or clear it with null. Unchanged objects keep their shells. */
  show(emphasis: SelectionEmphasis, object: THREE.Object3D | null, color: string): void;
  /** Call after world matrices and instancing are current, before rendering. `time` is in seconds; `pulsing` false holds the static tint. */
  update(time: number, pulsing: boolean): void;
  dispose(): void;
}

/** Meshes of `object` a shell can cover: opaque, not hardware-instanced, and not owned by a child scene node. */
function glowSources(object: THREE.Object3D): THREE.Mesh[] {
  const owner = object.userData.nodeId, sources: THREE.Mesh[] = [];
  const visit = (current: THREE.Object3D) => {
    if (current !== object && current.userData.nodeId !== undefined && current.userData.nodeId !== owner) return;
    const mesh = current as THREE.Mesh;
    if (mesh.isMesh && !(current instanceof THREE.InstancedMesh) && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => material.transparent)) sources.push(mesh);
    current.children.forEach(visit);
  };
  visit(object);
  return sources;
}

/**
 * Create the highlight in `container`, normally the scene. `isDrawn` says whether a mesh renders even if hidden,
 * which is true for instanced proxies. Owned by one renderer; `dispose` releases the shared materials.
 */
export function createGlowHighlight(container: THREE.Object3D, isDrawn: (mesh: THREE.Mesh) => boolean): GlowHighlight {
  const root = new THREE.Group(); root.name = 'selection-glow'; root.matrixAutoUpdate = false; container.add(root);
  const slot = (): GlowSlot => ({ object: null, shells: [], material: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false }) });
  const slots: Record<SelectionEmphasis, GlowSlot> = { selected: slot(), hovered: slot() };
  const shown = (mesh: THREE.Mesh, object: THREE.Object3D) => {
    if (!isDrawn(mesh)) return false;
    for (let current: THREE.Object3D | null = mesh.parent; current; current = current === object ? null : current.parent) if (!current.visible) return false;
    return true;
  };
  return {
    show(emphasis, object, color) {
      const current = slots[emphasis]; current.material.color.set(color).lerp(WHITE, GLOW_LIGHTEN);
      if (current.object === object) return;
      root.remove(...current.shells.map(shell => shell.mesh));
      current.object = object;
      current.shells = object ? glowSources(object).map(source => {
        const mesh = new THREE.Mesh(source.geometry, current.material);
        mesh.matrixAutoUpdate = false; mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.raycast = () => {};
        root.add(mesh); return { mesh, source };
      }) : [];
    },
    update(time, pulsing) {
      const pulse = pulsing ? (Math.sin(time * GLOW_PULSE_RATE) + 1) / 2 * GLOW_PULSE : 0;
      slots.selected.material.opacity = GLOW_OPACITY.selected + pulse; slots.hovered.material.opacity = GLOW_OPACITY.hovered;
      for (const { object, shells } of Object.values(slots)) if (object) for (const { mesh, source } of shells) { mesh.visible = shown(source, object); mesh.matrixWorld.copy(source.matrixWorld); }
    },
    dispose() { root.removeFromParent(); Object.values(slots).forEach(({ material }) => material.dispose()); },
  };
}
