import { BufferAttribute, BufferGeometry, Color, Material, Matrix3, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { assetAnimatedParts } from './animation';

/** Name of every mesh `mergeStaticParts` creates. */
export const MERGED_PART_NAME = 'merged-static-parts';

const separate = new WeakSet<Object3D>();
/**
 * Exclude a part and all of its descendants from `mergeStaticParts` and from the renderer's instancing
 * (ADR 0051), so the part keeps its own mesh, material and visibility. Use it for parts that code other
 * than the registered animator changes after the factory returns, e.g. a host that keeps a reference
 * to recolor a mesh. Animated parts are declared with `setAssetAnimator` instead. Called on the root
 * object, it keeps the whole asset as built. Call it inside the factory, before the object is returned.
 */
export function keepPartsSeparate(part: Object3D): void { separate.add(part); }

/** Result of one `mergeStaticParts` call: draw-relevant mesh counts before and after. */
export interface StaticMergeReport { meshesBefore: number; meshesAfter: number; }

const MATERIAL_TYPES: readonly (abstract new (...args: never[]) => Material)[] = [MeshStandardMaterial, MeshPhysicalMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshBasicMaterial];
/** Bookkeeping and per-part fields that do not change how the merged material renders. */
const IGNORED_MATERIAL_FIELDS = new Set(['uuid', 'id', 'name', 'version', 'color', 'userData', '_listeners']);

/**
 * Merge a freshly built node object's static meshes into as few meshes as possible, to cut draw calls.
 * The renderer calls it once per build, after `applyShadowPolicy` and before instance transforms,
 * selection markers and picking ids are added; a rebuild starts again from a fresh factory object.
 *
 * Frames: the root object and every part its animator declared (`setAssetAnimator`) are rigid frames.
 * A static mesh merges into a new mesh in its nearest frame, so it still follows that frame's motion.
 * A declared part that is itself a mesh is never merged, so its material and visibility stay its own.
 *
 * A mesh merges only when it is a plain visible `Mesh` leaf (no children such as anchors or labels)
 * under visible parents, outside `keepPartsSeparate` subtrees, with one opaque standard, physical,
 * Lambert, Phong or basic material without textures, vertex colors, clipping or custom shader hooks,
 * and a geometry with positions and normals and no morph targets or draw range. Everything else,
 * including `InstancedMesh`, lines, transparent parts and surface labels, stays as built.
 *
 * Grouping: meshes merge when their materials match in every rendering field except the base color,
 * and when their shadow flags (`castShadow`, `receiveShadow`, the policy's recorded outdoor flags),
 * render order and layers match. The color moves into a per-vertex color attribute with a white
 * material color, which renders identically. Each merged mesh owns a clone of its group's first
 * material and a new geometry in frame-local metres; uv coordinates are dropped because no merged
 * material uses a texture. A group of one mesh stays as built.
 *
 * Resources: merged meshes are named `MERGED_PART_NAME` and carry the group's shadow flags, so
 * `applyShadowPolicy` keeps switching them indoors and outdoors. Replaced geometries and materials
 * are disposed unless a remaining mesh still uses them; `disposeObject` releases the merged ones.
 * Limits: merged parts lose their names, so look parts up on the factory output (as tests do), not
 * in a mounted scene; anchors are not meshes and are always kept.
 */
export function mergeStaticParts(object: Object3D): StaticMergeReport {
  const meshesBefore = countMeshes(object);
  if (separate.has(object)) return { meshesBefore, meshesAfter: meshesBefore };
  const frames = new Set<Object3D>([object, ...assetAnimatedParts(object)]), candidates = new Map<Object3D, Mesh[]>();
  const visit = (node: Object3D, frame: Object3D) => {
    if (node !== object) {
      if (separate.has(node) || !node.visible) return;
      if (frames.has(node)) frame = node;
      else if (isMergeable(node)) { const list = candidates.get(frame) ?? []; list.push(node); candidates.set(frame, list); return; }
    }
    for (const child of node.children) visit(child, frame);
  };
  visit(object, object);
  object.updateMatrixWorld(true);
  const replaced: Mesh[] = [];
  for (const [frame, meshes] of candidates) {
    const groups = new Map<string, Mesh[]>();
    for (const mesh of meshes) { const key = groupKey(mesh), list = groups.get(key) ?? []; list.push(mesh); groups.set(key, list); }
    const toFrame = new Matrix4().copy(frame.matrixWorld).invert();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const merged = new Mesh(mergeGeometry(group, toFrame), mergedMaterial(group[0].material as Material));
      const first = group[0]; merged.name = MERGED_PART_NAME;
      merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow; merged.renderOrder = first.renderOrder; merged.layers.mask = first.layers.mask;
      if (Array.isArray(first.userData.shadowOutdoorFlags)) merged.userData.shadowOutdoorFlags = [...first.userData.shadowOutdoorFlags];
      frame.add(merged);
      for (const mesh of group) { mesh.removeFromParent(); replaced.push(mesh); }
    }
  }
  if (replaced.length) {
    const used = new Set<object>();
    object.traverse(child => { if ('geometry' in child && child.geometry) used.add(child.geometry as object); if ('material' in child && child.material) for (const material of [child.material].flat()) used.add(material as object); });
    for (const mesh of replaced) { if (!used.has(mesh.geometry)) { used.add(mesh.geometry); mesh.geometry.dispose(); } const material = mesh.material as Material; if (!used.has(material)) { used.add(material); material.dispose(); } }
  }
  return { meshesBefore, meshesAfter: countMeshes(object) };
}

function countMeshes(object: Object3D): number { let count = 0; object.traverse(child => { if ((child as Mesh).isMesh) count++; }); return count; }

/** Whether `part` or an ancestor up to `root` was excluded with `keepPartsSeparate`. */
export function isKeptSeparate(part: Object3D, root: Object3D): boolean {
  for (let current: Object3D | null = part; current; current = current === root ? null : current.parent) if (separate.has(current)) return true;
  return false;
}

/**
 * A plain visible `Mesh` leaf with one opaque standard, physical, Lambert, Phong or basic material
 * without textures, clipping or custom shader or render hooks, and a geometry without morph targets
 * or draw range. Shared by `mergeStaticParts` and the renderer's instancing; vertex colors are allowed here.
 */
export function isPlainOpaqueMesh(node: Object3D): node is Mesh {
  if (Object.getPrototypeOf(node) !== Mesh.prototype || node.children.length) return false;
  const mesh = node as Mesh, geometry = mesh.geometry, material = mesh.material;
  if (Array.isArray(material) || !MATERIAL_TYPES.some(type => Object.getPrototypeOf(material) === type.prototype)) return false;
  if (material.transparent || material.opacity !== 1 || material.alphaTest > 0 || material.alphaHash || material.clippingPlanes || !material.visible || ('wireframe' in material && material.wireframe)) return false;
  if (material.onBeforeCompile !== Material.prototype.onBeforeCompile || material.customProgramCacheKey !== Material.prototype.customProgramCacheKey) return false;
  if (Object.values(material).some(value => (value as { isTexture?: boolean } | null)?.isTexture)) return false;
  if (mesh.onBeforeRender !== Object3D.prototype.onBeforeRender || mesh.onAfterRender !== Object3D.prototype.onAfterRender || mesh.raycast !== Mesh.prototype.raycast || !mesh.frustumCulled) return false;
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3 || Object.keys(geometry.morphAttributes).length) return false;
  return geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;
}

function isMergeable(node: Object3D): node is Mesh {
  if (!isPlainOpaqueMesh(node) || (node.material as Material).vertexColors) return false;
  const normal = node.geometry.getAttribute('normal');
  return Boolean(normal) && normal.itemSize === 3;
}

/** Every rendering field of a material except its base color, as a stable string. */
export function materialRenderKey(material: Material): string {
  const fields: string[] = [material.type];
  for (const key of Object.keys(material).sort()) {
    if (IGNORED_MATERIAL_FIELDS.has(key)) continue;
    const value = (material as unknown as Record<string, unknown>)[key];
    if (typeof value === 'function') continue;
    fields.push(`${key}=${serialize(value)}`);
  }
  return fields.join('|');
}

function groupKey(mesh: Mesh): string {
  return `${materialRenderKey(mesh.material as Material)}|shadow=${mesh.castShadow}/${mesh.receiveShadow}/${JSON.stringify(mesh.userData.shadowOutdoorFlags ?? null)}|order=${mesh.renderOrder}|layers=${mesh.layers.mask}`;
}

function serialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value);
  if (value instanceof Color) return value.getHexString();
  if ('toArray' in value && typeof value.toArray === 'function') return JSON.stringify(value.toArray());
  return JSON.stringify(value);
}

function mergedMaterial(source: Material): Material {
  const material = source.clone() as MeshStandardMaterial;
  material.name = MERGED_PART_NAME; material.color.setRGB(1, 1, 1); material.vertexColors = true;
  return material;
}

/** One indexed geometry in frame-local metres with position, normal and per-vertex base color. */
function mergeGeometry(meshes: readonly Mesh[], toFrame: Matrix4): BufferGeometry {
  let vertices = 0, indices = 0;
  for (const mesh of meshes) { const count = mesh.geometry.getAttribute('position').count; vertices += count; indices += mesh.geometry.index?.count ?? count; }
  const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const matrix = new Matrix4(), normalMatrix = new Matrix3(), point = new Vector3();
  let vertexOffset = 0, indexOffset = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = (mesh.material as MeshStandardMaterial).color;
    matrix.multiplyMatrices(toFrame, mesh.matrixWorld); normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix); point.toArray(positions, (vertexOffset + i) * 3);
      point.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize(); point.toArray(normals, (vertexOffset + i) * 3);
      color.toArray(colors, (vertexOffset + i) * 3);
    }
    // A mirroring transform flips the triangle winding; reverse it so front faces stay front faces.
    const mirrored = matrix.determinant() < 0, source = geometry.index, count = source?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const a = source ? source.getX(i) : i, b = source ? source.getX(i + 1) : i + 1, c = source ? source.getX(i + 2) : i + 2;
      index[indexOffset + i] = vertexOffset + a; index[indexOffset + i + 1] = vertexOffset + (mirrored ? c : b); index[indexOffset + i + 2] = vertexOffset + (mirrored ? b : c);
    }
    vertexOffset += position.count; indexOffset += count;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('normal', new BufferAttribute(normals, 3)); geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(index, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
