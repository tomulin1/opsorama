import { Box3, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from 'three';

/**
 * Minimum shadow width in metres: a mesh whose second-largest bounding-box dimension is smaller
 * does not cast. At the default 2048 px shadow map over a 48–64 m scene one texel is 2.3–3.1 cm,
 * and soft PCF filtering blurs a shadow this narrow away, while each caster still costs one draw
 * call in the shadow pass. Covers barcode bars, seams, wires, thin trims and chair legs.
 */
export const SHADOW_MIN_WIDTH = .06;
/**
 * Containment tolerance in metres: a mesh whose bounds fit inside a larger casting mesh's bounds
 * grown by this margin on every side does not cast, because its shadow lies within the larger one.
 * Covers tape, stickers, labels, panel details and LEDs that sit on or slightly proud of a body.
 */
export const SHADOW_CONTAINMENT_TOLERANCE = .03;

/**
 * Where a built node sits. `interior` is true inside a building (`isInsideBuilding` in
 * `@opsorama/core`), for an interior area itself, and while the node's pivot lies inside an
 * interior area (`isWithinInteriorArea`).
 */
export interface ShadowPlacement { interior: boolean; }

/** Each mesh's narrowed outdoor flags, recorded on the first application. */
const OUTDOOR_FLAGS = 'shadowOutdoorFlags';
const NARROWED = 'shadowNarrowed';

/**
 * Apply the scene shadow policy to a node object. Call it once after the asset factory builds the
 * object and again whenever the placement changes; repeated calls are cheap and reversible.
 * - The first call narrows casting: meshes narrower than `SHADOW_MIN_WIDTH` or contained in a
 *   larger caster (`SHADOW_CONTAINMENT_TOLERANCE`) stop casting. It records each mesh's resulting
 *   flags in `userData.shadowOutdoorFlags`.
 * - Indoor placement turns casting and receiving off; outdoor placement restores the recorded flags.
 * The policy never turns on a flag the factory left off. Meshes of other nodes attached under this
 * object (different `userData.nodeId`) are skipped; they follow their own placement.
 * Bounds are measured once in the object's local metres in its built pose. Limits: an animated
 * part that later leaves its container keeps the first decision, and node `scale` is not included.
 */
export function applyShadowPolicy(object: Object3D, placement: ShadowPlacement): void {
  const meshes = ownMeshes(object);
  if (object.userData[NARROWED] !== true) { narrowCasters(object, meshes); object.userData[NARROWED] = true; }
  for (const mesh of meshes) {
    const outdoor: [boolean, boolean] = mesh.userData[OUTDOOR_FLAGS] ??= [mesh.castShadow, mesh.receiveShadow];
    mesh.castShadow = !placement.interior && outdoor[0]; mesh.receiveShadow = !placement.interior && outdoor[1];
  }
}

function ownMeshes(object: Object3D): Mesh[] {
  const owner = object.userData.nodeId, meshes: Mesh[] = [];
  const visit = (current: Object3D) => {
    if (current !== object && current.userData.nodeId !== undefined && current.userData.nodeId !== owner) return;
    if (current instanceof Mesh) meshes.push(current);
    current.children.forEach(visit);
  };
  visit(object); return meshes;
}

function narrowCasters(object: Object3D, meshes: readonly Mesh[]): void {
  object.updateMatrixWorld(true);
  const toLocal = new Matrix4().copy(object.matrixWorld).invert(), size = new Vector3();
  const casters: { mesh: Mesh; box: Box3; volume: number }[] = [];
  for (const mesh of meshes) {
    if (!mesh.castShadow) continue;
    if (mesh instanceof InstancedMesh) mesh.computeBoundingBox(); else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh instanceof InstancedMesh ? mesh.boundingBox : mesh.geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) continue;
    const box = bounds.clone().applyMatrix4(new Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld)); box.getSize(size);
    const [, width] = [size.x, size.y, size.z].sort((a, b) => b - a);
    if (width < SHADOW_MIN_WIDTH) mesh.castShadow = false;
    else casters.push({ mesh, box, volume: size.x * size.y * size.z });
  }
  // Largest first, so each container has its final decision before smaller parts are tested.
  casters.sort((a, b) => b.volume - a.volume);
  const kept: Box3[] = [];
  for (const caster of casters) {
    if (kept.some(container => container.containsBox(caster.box))) caster.mesh.castShadow = false;
    else kept.push(caster.box.clone().expandByScalar(SHADOW_CONTAINMENT_TOLERANCE));
  }
}
