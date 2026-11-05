import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialOverrides, VisualState } from '@opsorama/core';

/** Shared state tones for generic objects; recipes keep their own domain statuses. */
export const STATE_COLORS: Readonly<Record<'warning' | 'critical' | 'inactive', string>> = Object.freeze({ warning: '#e8b553', critical: '#dc6868', inactive: '#a7b1bf' });
export function stateColor(state: VisualState | undefined, fallback: string, palette?: MaterialOverrides): string {
  return state === 'warning' || state === 'critical' || state === 'inactive' ? palette?.[state] ?? STATE_COLORS[state] : fallback;
}

/** Neutral tones for decorative contents such as tote or cart items. */
export const ITEM_TONES = ['#d8b487', '#95b7df', '#9fcdb8'] as const;

/** `bevel` rounds box edges (radius in metres, clamped to the box); `metalness` stays modest because scenes have no environment map. */
export interface PartOptions { roughness?: number; metalness?: number; emissive?: string; opacity?: number; bevel?: number; flat?: boolean; }
/** Adds one mesh with its own geometry and material, so disposal never affects another instance. */
export function part(group: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, name = '', options: PartOptions = {}): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? .7, metalness: options.metalness ?? 0, flatShading: options.flat ?? false });
  if (options.emissive) { material.emissive.set(options.emissive); material.emissiveIntensity = .85; }
  if (options.opacity !== undefined) { material.transparent = true; material.opacity = options.opacity; material.depthWrite = false; }
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
  mesh.castShadow = options.opacity === undefined; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
export function block(group: THREE.Object3D, size: readonly [number, number, number], position: readonly [number, number, number], color: string, name = '', options?: PartOptions): THREE.Mesh {
  // One chamfer segment keeps rounded boxes cheap (108 triangles) while edges still catch the light.
  const geometry = options?.bevel ? new RoundedBoxGeometry(...size, 1, options.bevel) : new THREE.BoxGeometry(...size);
  const mesh = part(group, geometry, color, name, options); mesh.position.set(...position); return mesh;
}
export function cylinder(group: THREE.Object3D, radius: number, height: number, y: number, color: string, name = '', options?: PartOptions & { segments?: number; bottomRadius?: number }): THREE.Mesh {
  const mesh = part(group, new THREE.CylinderGeometry(radius, options?.bottomRadius ?? radius, height, options?.segments ?? 20), color, name, options); mesh.position.y = y; return mesh;
}
/** Merges already-transformed geometries into one mesh, so repeated small parts cost one draw call. */
export function merged(group: THREE.Object3D, geometries: THREE.BufferGeometry[], color: string, name = '', options?: PartOptions): THREE.Mesh {
  const geometry = mergeGeometries(geometries.map(item => item.index ? item.toNonIndexed() : item)); geometries.forEach(item => item.dispose());
  return part(group, geometry, color, name, options);
}
const BOLT = [[.12, .55], [-.26, -.05], [.03, -.05], [-.13, -.55], [.28, .1], [-.01, .1], [.24, .55]] as const;
/**
 * High-voltage warning sign facing +z, centered on `position`: dark-rimmed triangle with a lightning bolt.
 * Three thin meshes; `size` is the triangle edge length. Decorative only, it encodes no electrical state.
 */
export function voltageSign(group: THREE.Object3D, position: readonly [number, number, number], size: number, colors: { sign: string; bolt: string }, name: string): THREE.Group {
  const sign = new THREE.Group(); sign.name = `${name}-voltage-sign`; sign.position.set(...position); group.add(sign);
  const triangle = (edge: number) => { const h = edge * Math.sqrt(3) / 2; return new THREE.Shape([new THREE.Vector2(-edge / 2, -h / 3), new THREE.Vector2(edge / 2, -h / 3), new THREE.Vector2(0, h * 2 / 3)]); };
  const plate = (shape: THREE.Shape, z: number, color: string, part_: string) => { const mesh = part(sign, new THREE.ExtrudeGeometry(shape, { depth: .004, bevelEnabled: false }), color, `${name}-${part_}`, { roughness: .45 }); mesh.position.z = z; mesh.castShadow = false; return mesh; };
  plate(triangle(size), 0, colors.bolt, 'hazard-rim');
  plate(triangle(size * .84), .002, colors.sign, 'hazard');
  const scale = size * .4, lift = size * .03;
  plate(new THREE.Shape(BOLT.map(([x, y]) => new THREE.Vector2(x * scale, y * scale + lift))), .004, colors.bolt, 'bolt');
  return sign;
}
/** Named empty object marking a local connection point; it owns no resources. */
export function anchor(group: THREE.Object3D, name: string, position: readonly [number, number, number]): THREE.Object3D {
  const point = new THREE.Object3D(); point.name = `anchor-${name}`; point.position.set(...position); group.add(point); return point;
}
/** Tire with a rounded tread, light rim and dark hub cap, axle along x. `radius` and `width` are metres. */
export function wheel(group: THREE.Object3D, position: readonly number[], radius: number, width: number) {
  const inner = radius * .6, half = width / 2, edge = Math.min(radius * .2, half * .8);
  const profile = [[inner, -half], [radius - edge, -half], [radius - edge * .3, -half + edge * .3], [radius, -half + edge], [radius, half - edge], [radius - edge * .3, half - edge * .3], [radius - edge, half], [inner, half]].map(([x, y]) => new THREE.Vector2(x, y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), new THREE.MeshStandardMaterial({ color: '#273545', roughness: .85, side: THREE.DoubleSide })); mesh.name = 'wheel-tire'; mesh.rotation.z = Math.PI / 2; mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = true; group.add(mesh);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(inner * 1.02, inner * 1.02, width * .82, 16), new THREE.MeshStandardMaterial({ color: '#b8c8d7', roughness: .4, metalness: .3 })); hub.name = 'wheel-hub'; hub.rotation.copy(mesh.rotation); hub.position.copy(mesh.position); group.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * .2, radius * .2, width * .9, 12), new THREE.MeshStandardMaterial({ color: '#56657a', roughness: .5 })); cap.name = 'wheel-cap'; cap.rotation.copy(mesh.rotation); cap.position.copy(mesh.position); group.add(cap);
}

/** Appends a flat wire grid in the local x/y plane (z = 0) as segment endpoints; rotate it with `axis`. */
export function gridWires(target: number[], center: readonly [number, number, number], [width, height]: readonly [number, number], spacing: number, axis: 'x' | 'z' = 'z'): void {
  const put = (u: number, v: number) => axis === 'z' ? target.push(center[0] + u, center[1] + v, center[2]) : target.push(center[0], center[1] + v, center[2] + u);
  for (let u = -width / 2 + spacing / 2; u < width / 2; u += spacing) { put(u, -height / 2); put(u, height / 2); }
  for (let v = -height / 2 + spacing / 2; v < height / 2; v += spacing) { put(-width / 2, v); put(width / 2, v); }
}
/** One LineSegments object for all wires of a cage or basket; decorative, so it never intercepts picking. */
export function wires(group: THREE.Object3D, positions: readonly number[], color: string, name: string): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })); lines.name = name; lines.raycast = () => {}; group.add(lines); return lines;
}
