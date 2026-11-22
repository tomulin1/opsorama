import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LineNode, MaterialOverrides, SceneNode, ShapeGeometry, ShapeNode } from '@opsorama/core';
import { assetFactory, type AssetRegistry } from './assets';
import { buildPrimitive } from './primitives';

/*
 * Builds the Three.js object of every scene node kind, for the scene renderer and the node preview. Each built object
 * owns its geometries and materials; release it with `disposeObject`. Internal to the package.
 */

/** What building a node needs besides the node: the asset registry and the scene's theme and palette. */
export interface NodeBuildContext { assets: AssetRegistry; theme: 'light' | 'midnight'; palette?: MaterialOverrides }

/** Shape and line colors without `color` or a palette role, per theme; they match the catalog's default tones. */
export const PRIMITIVE_COLORS = Object.freeze({
  light: Object.freeze({ accent: '#6c97d9', structure: '#7f8fa6' }),
  midnight: Object.freeze({ accent: '#87a5e0', structure: '#99abc0' }),
});
/** Shape colors for visual states without a palette role, matching the catalog's state tones. */
const STATE_COLORS = Object.freeze({ busy: '#5088ec', warning: '#e6b569', critical: '#df6470', inactive: '#788297' });

/**
 * Color of a shape node: `color`; else for `busy`, `warning`, `critical` and `inactive` the palette role of that state;
 * else the palette `accent` role; each falls back to the theme default.
 */
export function shapeColor(node: ShapeNode, context: Pick<NodeBuildContext, 'theme' | 'palette'>): string {
  if (node.color) return node.color;
  if (node.state && node.state !== 'normal') return context.palette?.[node.state] ?? STATE_COLORS[node.state];
  return context.palette?.accent ?? PRIMITIVE_COLORS[context.theme].accent;
}
/** Color of a line node: `color`, else the palette `structure` role, else the theme default. */
export function lineColor(node: LineNode, context: Pick<NodeBuildContext, 'theme' | 'palette'>): string {
  return node.color || (context.palette?.structure ?? PRIMITIVE_COLORS[context.theme].structure);
}

/** Radial and height segments of the unit sphere and the radial segments of the unit cylinder. */
const SPHERE_SEGMENTS = [32, 16] as const, CYLINDER_SEGMENTS = 32;
/** Proportions are rounded so that equal ratios written differently still share bytes, and so a batch. */
const ratio = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The unit geometry of a shape with its base at y = 0, and the mesh scale that sizes it. Only the cylinder's radius ratio
 * changes the unit geometry; every box, every sphere and every cylinder with the same ratio is byte-identical, so the
 * renderer's instancing draws them as one batch whatever their size and color.
 */
export function unitShapeGeometry(shape: ShapeGeometry): { geometry: THREE.BufferGeometry; scale: [number, number, number]; height: number } {
  switch (shape.type) {
    case 'box': return { geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), scale: [shape.size[0], shape.size[1], shape.size[2]], height: shape.size[1] };
    case 'sphere': return { geometry: new THREE.SphereGeometry(1, ...SPHERE_SEGMENTS).translate(0, 1, 0), scale: [shape.radius, shape.radius, shape.radius], height: shape.radius * 2 };
    case 'cylinder': {
      const radius = Math.max(shape.radiusTop, shape.radiusBottom);
      return { geometry: new THREE.CylinderGeometry(ratio(shape.radiusTop / radius), ratio(shape.radiusBottom / radius), 1, CYLINDER_SEGMENTS).translate(0, .5, 0), scale: [radius, shape.height, radius], height: shape.height };
    }
  }
}

/** A shape: a group holding one mesh with the unit geometry, scaled to size. The label sits 0.3 m above its top. */
function buildShape(node: ShapeNode, context: NodeBuildContext): THREE.Group {
  const root = new THREE.Group(), { geometry, scale, height } = unitShapeGeometry(node.shape);
  const opacity = node.opacity ?? 1, transparent = opacity < 1;
  const material = new THREE.MeshStandardMaterial({ color: shapeColor(node, context), roughness: .62, metalness: .04, ...(transparent ? { transparent: true, opacity, depthWrite: false } : {}) });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'shape'; mesh.scale.set(...scale);
  // Transparent shapes cast no shadow; the shadow policy narrows thin opaque ones.
  mesh.castShadow = !transparent; mesh.receiveShadow = true;
  root.add(mesh); root.userData.labelHeight = height + .3;
  return root;
}

/**
 * Dash pattern of dashed lines in metres. A 1-pixel line draws `dash` and leaves `gap`; a tube uses at least three
 * times its width for the dash and twice its width for the gap, so thick dashes stay longer than they are wide.
 */
export const LINE_DASH = Object.freeze({ dash: .3, gap: .2 });
/** Radial segments of a line tube. */
const TUBE_SEGMENTS = 8;

/**
 * One geometry for a polyline tube of `radius`: a closed cylinder per segment (or per dash), and a sphere at every inner
 * point of a solid line so corners stay round. Zero-length segments are skipped. The parts are merged and released.
 */
function tubeGeometry(points: readonly THREE.Vector3[], radius: number, dashed: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
  const piece = (a: THREE.Vector3, b: THREE.Vector3) => {
    const length = a.distanceTo(b); if (length < 1e-6) return;
    quaternion.setFromUnitVectors(up, direction.subVectors(b, a).divideScalar(length));
    parts.push(new THREE.CylinderGeometry(radius, radius, length, TUBE_SEGMENTS, 1, false).applyMatrix4(matrix.compose(a.clone().lerp(b, .5), quaternion, unit)));
  };
  if (dashed) {
    // Dashes cover [k × period, k × period + dash] of the distance along the whole polyline, across corners.
    const dash = Math.max(LINE_DASH.dash, radius * 6), period = dash + Math.max(LINE_DASH.gap, radius * 4);
    let start = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], length = a.distanceTo(b), end = start + length;
      if (length >= 1e-6) for (let k = Math.floor(start / period); k * period < end; k++) {
        const from = Math.max(start, k * period), to = Math.min(end, k * period + dash);
        if (to - from > 1e-6) piece(a.clone().lerp(b, (from - start) / length), a.clone().lerp(b, (to - start) / length));
      }
      start = end;
    }
  } else {
    for (let i = 0; i < points.length - 1; i++) piece(points[i], points[i + 1]);
    for (let i = 1; i < points.length - 1; i++) parts.push(new THREE.SphereGeometry(radius, TUBE_SEGMENTS, TUBE_SEGMENTS / 2).translate(points[i].x, points[i].y, points[i].z));
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  parts.forEach(part => part.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** A line: a 1-pixel `THREE.Line` for width 0, otherwise a lit tube mesh. The label sits 0.3 m above the origin. */
function buildLine(node: LineNode, context: NodeBuildContext): THREE.Group {
  const root = new THREE.Group(), color = lineColor(node, context), width = node.width ?? 0, dashed = node.dashed === true;
  const points = node.points.map(point => new THREE.Vector3(...point));
  if (width === 0) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), dashed ? new THREE.LineDashedMaterial({ color, dashSize: LINE_DASH.dash, gapSize: LINE_DASH.gap }) : new THREE.LineBasicMaterial({ color }));
    if (dashed) line.computeLineDistances();
    line.name = 'line'; root.add(line);
  } else {
    const mesh = new THREE.Mesh(tubeGeometry(points, width / 2, dashed), new THREE.MeshStandardMaterial({ color, roughness: .7 }));
    mesh.name = 'line'; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
  root.userData.labelHeight = .3;
  return root;
}

/** Builds the object of a node of any kind. Asset nodes run their factory's `validate` first; unknown assets throw. */
export function buildNodeObject(node: SceneNode, context: NodeBuildContext): THREE.Object3D {
  switch (node.kind) {
    case 'asset': {
      const factory = assetFactory(context.assets, node.asset); factory.validate?.(node);
      return factory(node, { theme: context.theme, palette: context.palette });
    }
    // Markers are HTML; groups are containers without geometry, and their label sits at their origin.
    case 'marker': return new THREE.Group();
    case 'group': { const group = new THREE.Group(); group.userData.labelHeight = 0; return group; }
    case 'shape': return buildShape(node, context);
    case 'line': return buildLine(node, context);
    case 'ground': case 'zone': case 'path': return buildPrimitive(node);
    default: return unknownKind(node);
  }
}
function unknownKind(node: never): never { throw new Error(`Unknown scene node kind: ${String((node as { kind?: unknown }).kind)}.`); }

/**
 * Bounds of every mesh under `object`, including the objects of nodes it contains, in `object`'s local metres. Used for
 * the selection marker of a group, whose own object has no geometry. Selection markers are skipped.
 */
export function contentBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert(), bounds = new THREE.Box3(), part = new THREE.Box3(), matrix = new THREE.Matrix4();
  const visit = (current: THREE.Object3D) => {
    if (current.name === 'selection-corners') return;
    const mesh = current as THREE.Mesh;
    if (mesh.isMesh && !(current instanceof THREE.InstancedMesh)) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox!.isEmpty()) bounds.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld)));
    }
    current.children.forEach(visit);
  };
  visit(object);
  return bounds;
}
