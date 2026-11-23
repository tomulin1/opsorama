import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_TEXT_SIZE, type ImageNode, type LineNode, type MaterialOverrides, type SceneNode, type ShapeGeometry, type ShapeNode, type TextNode } from '@opsorama/core';
import { addObjectRelease, assetFactory, type AssetRegistry } from './assets';
import { buildPrimitive } from './primitives';
import { createImageTextureCache, createTextTextureCache, type ImageTextureCache, type LoadImage, type TextCanvasFactory, type TextTextureCache } from './text-texture';

/*
 * Builds the Three.js object of every scene node kind, for the scene renderer and the node preview. Each built object
 * owns its geometries and materials, and holds its uses of shared text and image textures; release it with
 * `disposeObject`. Internal to the package.
 */

/**
 * What building a node needs besides the node: the asset registry, the scene's theme and palette, and for text and image
 * nodes the renderer's texture caches and where image load results go. Without `textures` every text and image node owns
 * its textures (nothing is shared).
 */
export interface NodeBuildContext {
  assets: AssetRegistry; theme: 'light' | 'midnight'; palette?: MaterialOverrides;
  textures?: NodeTextures;
  /** An image failed to load; the message names the node and the URL. */
  onError?: (error: Error) => void;
  /** An image texture was applied after its node was built, so a renderer that draws on demand draws again. */
  onTextureLoad?: () => void;
}

/** Texture caches of one renderer for text and image nodes. `dispose` releases every texture when the renderer is disposed. */
export interface NodeTextures { text: TextTextureCache; images: ImageTextureCache; dispose(): void }
/** Creates the texture caches of one renderer; tests pass a canvas factory and an image loader. */
export function createNodeTextures(options: { createCanvas?: TextCanvasFactory; loadImage?: LoadImage } = {}): NodeTextures {
  const text = createTextTextureCache(options.createCanvas), images = createImageTextureCache(options.loadImage);
  return { text, images, dispose: () => { text.dispose(); images.dispose(); } };
}

/** Text colors without `color` or a palette `text` role, per theme. */
export const TEXT_COLORS = Object.freeze({ light: '#1f2d3d', midnight: '#e6edf7' });
/** Image placeholder colors per theme, shown until the image has loaded and kept when it fails. */
export const IMAGE_PLACEHOLDER_COLORS = Object.freeze({ light: '#c9d3df', midnight: '#3b4a60' });

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
/** Color of a text node: `color`, else the palette `text` role, else the theme default. */
export function textColor(node: TextNode, context: Pick<NodeBuildContext, 'theme' | 'palette'>): string {
  return node.color || (context.palette?.text ?? TEXT_COLORS[context.theme]);
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

/**
 * Material of a text or image surface: unlit and not tone-mapped, so its colors show as given; transparent, so it is never
 * merged or instanced; fully transparent pixels are discarded so they do not hide what is behind them.
 */
function surfaceMaterial(billboard: boolean, color: string, map: THREE.Texture | null): THREE.SpriteMaterial | THREE.MeshBasicMaterial {
  const options = { color, map, transparent: true, alphaTest: .01, toneMapped: false };
  return billboard ? new THREE.SpriteMaterial(options) : new THREE.MeshBasicMaterial({ ...options, side: THREE.DoubleSide });
}
/**
 * A rectangle `width` × `height` standing on the origin, with the origin at `anchor` along its width (0 left, 1 right):
 * a plane facing +z, or a sprite that faces the camera and anchors horizontally on screen.
 */
function surface(material: THREE.SpriteMaterial | THREE.MeshBasicMaterial, width: number, height: number, anchor: number): THREE.Object3D {
  if (material instanceof THREE.SpriteMaterial) {
    const sprite = new THREE.Sprite(material); sprite.center.set(anchor, .5); sprite.scale.set(width, height, 1); sprite.position.y = height / 2;
    return sprite;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).translate((.5 - anchor) * width, height / 2, 0), material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
const nodeTextures = (context: NodeBuildContext) => context.textures ?? createNodeTextures();

/** A text: its cached canvas texture on a plane or sprite sized by `size`. The label sits 0.3 m above the text. */
function buildText(node: TextNode, context: NodeBuildContext): THREE.Group {
  const root = new THREE.Group(), handle = nodeTextures(context).text.acquire({ text: node.text, color: textColor(node, context), align: node.align ?? 'center' });
  addObjectRelease(root, handle.release);
  const { texture, width, height, anchor } = handle.value, size = node.size ?? DEFAULT_TEXT_SIZE;
  // The texture carries the color; the material stays white.
  const part = surface(surfaceMaterial(node.billboard === true, '#ffffff', texture), width * size, height * size, anchor);
  part.name = 'text'; root.add(part); root.userData.labelHeight = height * size + .3;
  return root;
}

/**
 * `Error.name` of the error an image node reports to `onError` when its image fails to load. The scene keeps working (the
 * node keeps its placeholder), so the React and Vue `SceneCanvas` report it without showing their "Scene unavailable" panel.
 */
export const IMAGE_LOAD_ERROR = 'ImageLoadError';
/** Shortened `src` for messages: data URLs can be very long. */
const shownSrc = (src: string) => JSON.stringify(src.length > 80 ? `${src.slice(0, 80)}…` : src);
/**
 * An image: a placeholder rectangle of `size` until the shared texture of `src` arrives, then the picture. A node rebuilt or
 * removed before then has released its use, so a late image is never applied to it; the last use cancels the load or
 * disposes the texture. A failed load keeps the placeholder and reports to `onError`. The label sits 0.3 m above the image.
 */
function buildImage(node: ImageNode, context: NodeBuildContext): THREE.Group {
  const root = new THREE.Group(), [width, height] = node.size;
  const material = surfaceMaterial(node.billboard === true, IMAGE_PLACEHOLDER_COLORS[context.theme], null);
  const part = surface(material, width, height, .5); part.name = 'image'; root.add(part);
  let built = false;
  const release = nodeTextures(context).images.acquire(node.src, {
    load: texture => { material.map = texture; material.color.set('#ffffff'); material.needsUpdate = true; if (built) context.onTextureLoad?.(); },
    error: () => {
      const error = new Error(`Image node ${node.id} could not load ${shownSrc(node.src)}. Check that the URL is reachable and that it is an image the browser can decode (PNG, JPEG, WebP, or SVG with width and height); an image from another origin also needs Access-Control-Allow-Origin from its server, because images load with crossOrigin "anonymous". The node keeps its placeholder.`);
      error.name = IMAGE_LOAD_ERROR; context.onError?.(error);
    },
  });
  addObjectRelease(root, release); built = true;
  root.userData.labelHeight = height + .3;
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
    case 'text': return buildText(node, context);
    case 'image': return buildImage(node, context);
    case 'ground': case 'zone': case 'path': return buildPrimitive(node);
    default: return unknownKind(node);
  }
}
function unknownKind(node: never): never { throw new Error(`Unknown scene node kind: ${String((node as { kind?: unknown }).kind)}.`); }

const SPRITE_QUAD = new THREE.Box3(new THREE.Vector3(-.5, -.5, 0), new THREE.Vector3(.5, .5, 0));
/**
 * Bounds of every mesh and sprite under `object`, including the objects of nodes it contains, in `object`'s local metres.
 * Used for the selection marker of a group, whose own object has no geometry. Selection markers are skipped. A sprite
 * counts as its unit quad placed by its world matrix; it turns with the camera, so its share is approximate.
 */
export function contentBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert(), bounds = new THREE.Box3(), part = new THREE.Box3(), matrix = new THREE.Matrix4();
  const visit = (current: THREE.Object3D) => {
    if (current.name === 'selection-corners') return;
    const mesh = current as THREE.Mesh;
    if (current instanceof THREE.Sprite) bounds.union(part.copy(SPRITE_QUAD).applyMatrix4(matrix.multiplyMatrices(inverse, current.matrixWorld)));
    if (mesh.isMesh && !(current instanceof THREE.InstancedMesh)) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox!.isEmpty()) bounds.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld)));
    }
    current.children.forEach(visit);
  };
  visit(object);
  return bounds;
}
