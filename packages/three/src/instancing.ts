import { Group, InstancedMesh, Matrix4, type BufferAttribute, type BufferGeometry, type InterleavedBufferAttribute, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { assetAnimatedParts } from './animation';
import { isKeptSeparate, isPlainOpaqueMesh, materialRenderKey } from './static-merge';

/**
 * Minimum number of identical meshes before they render as one `InstancedMesh`.
 * A batch of n meshes saves n − 1 draw calls but adds an instanced shader variant per material and a
 * per-frame matrix check per member, so groups of two or three (one or two saved draws) render as built.
 * A tuning constant, not a measured optimum.
 */
export const INSTANCING_MIN_COUNT = 4;

/** Name of every `InstancedMesh` the batcher creates, and of the group that holds them. */
export const INSTANCED_BATCH_NAME = 'instanced-batch';

/** Current instancing state: batches that render as an `InstancedMesh` and the meshes they draw. */
export interface InstancingStats { batches: number; instances: number; }

/**
 * Renders repeated identical meshes of different node objects as one `InstancedMesh` per batch.
 * Members stay in the scene graph as hidden proxies: they keep their names, transforms, picking ids
 * and bounds, and every frame `update` copies their world matrices and visibility into the batch.
 * Owned by one renderer; `dispose` releases every batch resource and shows the proxies again.
 */
export interface InstanceBatcher {
  /** Register a node object's eligible meshes. Call after its world matrix is current. Re-adding an object replaces its registration. */
  add(object: Object3D): void;
  /** Unregister a node object and show its meshes again; call before disposing the object. */
  remove(object: Object3D): void;
  /** Re-register an object whose meshes changed shadow flags; no effect on an unregistered object. */
  refresh(object: Object3D): void;
  /** Apply pending batch changes and copy proxy world matrices into the batches. Call after `updateMatrixWorld`, before rendering. */
  update(): void;
  /** Whether a mesh is a hidden proxy drawn by a batch; picking treats it as visible. */
  isProxy(object: Object3D): boolean;
  stats(): InstancingStats;
  dispose(): void;
}

interface Batch { key: string; members: Mesh[]; geometry: BufferGeometry | null; material: Material | null; mesh: InstancedMesh | null; dirty: boolean; }

/**
 * Create the batcher for one scene; batches are added to `container` (normally the scene) in a group
 * named `INSTANCED_BATCH_NAME`, so they must not be raycast for picking.
 *
 * Eligible meshes: every mesh the object owns (descendants of other nodes are skipped) that passes
 * `isPlainOpaqueMesh` (vertex colors allowed), is visible, is not itself an animated part declared with
 * `setAssetAnimator` (its material or visibility may change), is outside `keepPartsSeparate`, and has a
 * world matrix with a positive determinant (instancing cannot flip winding per instance).
 * Meshes inside declared animated parts, and whole moving nodes, are eligible: their matrices are
 * copied every frame.
 *
 * Batching: meshes join one batch when their geometries are byte-identical (positions, normals,
 * colors, other attributes and index) and their materials match in every rendering field except the
 * base color, with equal shadow flags, render order and layers. The base color becomes the instance
 * color on a white material, which renders identically. A batch renders instanced once it has
 * `INSTANCING_MIN_COUNT` members; it owns a clone of the geometry and material, released when it drops
 * below the minimum.
 *
 * Limits: a hidden ancestor hides the instance (zero-scale matrix) but the batch still issues its draw;
 * batches are not frustum culled; a member whose world matrix later turns mirrored renders with the
 * wrong winding; proxies whose meshes were drawn before their batch formed keep their GPU buffers until
 * they are disposed.
 */
export function createInstanceBatcher(container: Object3D): InstanceBatcher {
  const root = new Group(); root.name = INSTANCED_BATCH_NAME; root.matrixAutoUpdate = false; container.add(root);
  const batches = new Map<string, Batch>(), owners = new Map<Object3D, Mesh[]>(), batchOf = new Map<Mesh, Batch>(), signatures = new WeakMap<BufferGeometry, string>();
  const hidden = new Matrix4().makeScale(0, 0, 0).elements;
  let pending = false;

  const signature = (geometry: BufferGeometry) => {
    let value = signatures.get(geometry);
    if (value === undefined) { value = geometrySignature(geometry); signatures.set(geometry, value); }
    return value;
  };
  const release = (batch: Batch) => {
    batch.mesh?.removeFromParent(); batch.mesh?.dispose(); batch.geometry?.dispose(); batch.material?.dispose();
    batch.mesh = null; batch.geometry = null; batch.material = null;
  };

  function add(object: Object3D): void {
    if (owners.has(object)) remove(object);
    const owner = object.userData.nodeId, animated = new Set(assetAnimatedParts(object)), members: Mesh[] = [];
    const visit = (current: Object3D) => {
      if (current !== object && current.userData.nodeId !== undefined && current.userData.nodeId !== owner) return;
      if (isPlainOpaqueMesh(current) && current.visible && !animated.has(current) && !isKeptSeparate(current, object) && current.matrixWorld.determinant() > 0) members.push(current);
      current.children.forEach(visit);
    };
    visit(object);
    for (const mesh of members) {
      const material = mesh.material as Material, base = `${signature(mesh.geometry)}|${materialRenderKey(material)}|shadow=${mesh.castShadow}/${mesh.receiveShadow}|order=${mesh.renderOrder}|layers=${mesh.layers.mask}`;
      let key = base, batch = batches.get(key);
      // A signature collision with different bytes gets its own batch.
      for (let n = 1; batch && !sameGeometry(batch.members[0].geometry, mesh.geometry); n++) { key = `${base}#${n}`; batch = batches.get(key); }
      if (!batch) { batch = { key, members: [], geometry: null, material: null, mesh: null, dirty: false }; batches.set(key, batch); }
      batch.members.push(mesh); batchOf.set(mesh, batch); batch.dirty = true;
    }
    owners.set(object, members); pending = true;
  }

  function remove(object: Object3D): void {
    const members = owners.get(object);
    if (!members) return;
    owners.delete(object);
    for (const mesh of members) {
      const batch = batchOf.get(mesh)!; batchOf.delete(mesh); mesh.visible = true;
      batch.members.splice(batch.members.indexOf(mesh), 1); batch.dirty = true; pending = true;
      if (!batch.members.length) { release(batch); batches.delete(batch.key); }
    }
  }

  function flush(): void {
    pending = false;
    for (const batch of batches.values()) {
      if (!batch.dirty) continue;
      batch.dirty = false;
      if (batch.members.length < INSTANCING_MIN_COUNT) { release(batch); batch.members.forEach(mesh => { mesh.visible = true; }); continue; }
      const first = batch.members[0];
      if (!batch.geometry || !batch.material) {
        batch.geometry = first.geometry.clone();
        const material = (first.material as MeshStandardMaterial).clone(); material.color.setRGB(1, 1, 1); batch.material = material;
      }
      if (!batch.mesh || batch.mesh.instanceMatrix.count < batch.members.length) {
        batch.mesh?.removeFromParent(); batch.mesh?.dispose();
        let capacity = INSTANCING_MIN_COUNT; while (capacity < batch.members.length) capacity *= 2;
        const mesh = new InstancedMesh(batch.geometry, batch.material, capacity); mesh.name = INSTANCED_BATCH_NAME;
        mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder; mesh.layers.mask = first.layers.mask;
        // Instances span the whole scene and move every frame; picking uses the proxies instead.
        mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.raycast = () => {};
        batch.mesh = mesh; root.add(mesh);
      }
      const mesh = batch.mesh; mesh.count = batch.members.length;
      batch.members.forEach((member, i) => { member.visible = false; mesh.setColorAt(i, (member.material as MeshStandardMaterial).color); });
      mesh.instanceColor!.needsUpdate = true;
      // NaN never equals a matrix element, so `update` rewrites every instance of a changed batch.
      mesh.instanceMatrix.array.fill(Number.NaN, 0, batch.members.length * 16);
    }
  }

  const shown = (mesh: Mesh) => {
    for (let current = mesh.parent; current; current = current.parent) { if (current === container) return true; if (!current.visible) return false; }
    return false;
  };

  function update(): void {
    if (pending) flush();
    for (const batch of batches.values()) {
      const mesh = batch.mesh;
      if (!mesh) continue;
      const array = mesh.instanceMatrix.array; let changed = false;
      for (let i = 0; i < batch.members.length; i++) {
        const member = batch.members[i], source = shown(member) ? member.matrixWorld.elements : hidden, offset = i * 16;
        for (let j = 0; j < 16; j++) if (array[offset + j] !== source[j]) { array.set(source, offset); changed = true; break; }
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    add, remove, update,
    refresh: object => { if (owners.has(object)) add(object); },
    isProxy: object => Boolean(batchOf.get(object as Mesh)?.mesh),
    stats: () => { let count = 0, instances = 0; for (const batch of batches.values()) if (batch.mesh) { count++; instances += batch.members.length; } return { batches: count, instances }; },
    dispose: () => { for (const object of [...owners.keys()]) remove(object); for (const batch of batches.values()) release(batch); batches.clear(); root.removeFromParent(); },
  };
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;
const bytesOf = (attribute: Attribute) => {
  const array = 'isInterleavedBufferAttribute' in attribute ? attribute.data.array : attribute.array;
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
};
const describe = (name: string, attribute: Attribute) => `${name}:${attribute.itemSize}:${attribute.normalized}:${'isInterleavedBufferAttribute' in attribute ? `i${attribute.offset}/${attribute.data.stride}` : attribute.array.constructor.name}`;
const parts = (geometry: BufferGeometry): [string, Uint8Array][] => [
  ...Object.keys(geometry.attributes).sort().map(name => [describe(name, geometry.attributes[name]), bytesOf(geometry.attributes[name])] as [string, Uint8Array]),
  ...(geometry.index ? [[`index:${geometry.index.array.constructor.name}`, bytesOf(geometry.index)] as [string, Uint8Array]] : []),
  ...geometry.groups.map((group, i) => [`group${i}:${group.start}/${group.count}/${group.materialIndex}`, new Uint8Array(0)] as [string, Uint8Array]),
];

/** FNV-1a over every attribute's and the index's bytes, with their layout; equal bytes give equal signatures. */
function geometrySignature(geometry: BufferGeometry): string {
  let hash = 0x811c9dc5; const layout: string[] = [];
  for (const [name, bytes] of parts(geometry)) {
    layout.push(name);
    const words = bytes.byteOffset % 4 === 0 ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2) : null;
    if (words) for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i], 0x01000193);
    for (let i = words ? words.length * 4 : 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 0x01000193);
  }
  return `${layout.join(',')}#${(hash >>> 0).toString(36)}`;
}

function sameGeometry(a: BufferGeometry, b: BufferGeometry): boolean {
  if (a === b) return true;
  const left = parts(a), right = parts(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const [nameA, bytesA] = left[i], [nameB, bytesB] = right[i];
    if (nameA !== nameB || bytesA.length !== bytesB.length) return false;
    for (let j = 0; j < bytesA.length; j++) if (bytesA[j] !== bytesB[j]) return false;
  }
  return true;
}
