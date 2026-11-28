import * as THREE from 'three';

/** A node the renderer tints (`SceneRenderer.setHighlights`), e.g. each thing a viewer can pick up now. */
export interface NodeHighlight {
  /** Scene node to tint; nodes inside it keep their look unless listed too. A node that is not built yet is tinted once it is. */
  node: string;
  /** Glow color, a CSS color. Default the palette's accent. */
  color?: string;
}

/**
 * The tint glows: an additive fill that brightens the model in its color, and a halo, a back-facing hull pushed outward
 * along the normals, that lights its outline. Opacities at rest and the peak added by the pulse while motion runs.
 */
const FILL_OPACITY = .32, FILL_PULSE = .22, HALO_OPACITY = .7, HALO_PULSE = .3, PULSE_RATE = 3.2;
/** Width of the halo in view-space metres, whatever the model's scale. */
export const HALO_WIDTH = .045;

interface TintShell { meshes: THREE.Mesh[]; source: THREE.Mesh; }
interface Tint { id: string; color: string; object: THREE.Object3D | null; shells: TintShell[]; }
interface TintLook { fill: THREE.MeshBasicMaterial; halo: THREE.ShaderMaterial; }

const HALO_VERTEX = `uniform float width;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  view.xyz += normalize(normalMatrix * normal) * width;
  gl_Position = projectionMatrix * view;
}`;
const HALO_FRAGMENT = `uniform vec3 color;
uniform float opacity;
void main() { gl_FragColor = vec4(color, opacity); }`;

/** Tints any number of nodes with a glow: an additive fill over each opaque mesh and a halo around its outline. */
export interface NodeHighlights {
  /** Replace the tinted nodes; an empty list clears them. */
  set(highlights: readonly NodeHighlight[], accent: string): void;
  /** Call after world matrices and instancing are current, before rendering. Rebuilt nodes get new shells. */
  update(time: number, pulsing: boolean): void;
  readonly size: number;
  dispose(): void;
}

/** Opaque, not hardware-instanced meshes of `object`, without those of other scene nodes inside it (they have their own tint). */
function tintSources(object: THREE.Object3D): THREE.Mesh[] {
  const sources: THREE.Mesh[] = [], owner = object.userData.nodeId;
  const visit = (current: THREE.Object3D) => {
    if (current.name === 'selection-corners' || (current !== object && current.userData.nodeId !== undefined && current.userData.nodeId !== owner)) return;
    const mesh = current as THREE.Mesh;
    if (mesh.isMesh && !(current instanceof THREE.InstancedMesh) && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => material.transparent)) sources.push(mesh);
    current.children.forEach(visit);
  };
  visit(object);
  return sources;
}

/**
 * Create the tints in `container`, normally the scene. `resolve` returns a node's current object (or nothing while it is not
 * built); `isDrawn` says whether a hidden mesh still renders, as an instanced proxy does. Owned by one renderer.
 */
export function createNodeHighlights(container: THREE.Object3D, resolve: (id: string) => THREE.Object3D | undefined, isDrawn: (mesh: THREE.Mesh) => boolean): NodeHighlights {
  const root = new THREE.Group(); root.name = 'node-highlights'; root.matrixAutoUpdate = false; container.add(root);
  const looks = new Map<string, TintLook>();
  let tints: Tint[] = [];
  const lookFor = (color: string) => {
    let look = looks.get(color);
    if (!look) {
      const fill = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false });
      const halo = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: HALO_OPACITY }, width: { value: HALO_WIDTH } }, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      look = { fill, halo }; looks.set(color, look);
    }
    return look;
  };
  const shellOf = (source: THREE.Mesh, look: TintLook): TintShell => {
    // The halo needs normals to push the hull out; a mesh without them gets only the fill.
    const meshes = [new THREE.Mesh(source.geometry, look.fill), ...(source.geometry.attributes.normal ? [new THREE.Mesh(source.geometry, look.halo)] : [])];
    meshes.forEach((mesh, i) => { mesh.matrixAutoUpdate = false; mesh.renderOrder = 5 + i; mesh.frustumCulled = false; mesh.raycast = () => {}; root.add(mesh); });
    return { meshes, source };
  };
  const clearShells = (tint: Tint) => { root.remove(...tint.shells.flatMap(shell => shell.meshes)); tint.shells = []; };
  const shown = (mesh: THREE.Mesh, object: THREE.Object3D) => {
    if (!mesh.visible && !isDrawn(mesh)) return false;
    for (let current: THREE.Object3D | null = mesh.parent; current; current = current === object ? null : current.parent) if (!current.visible) return false;
    return true;
  };
  return {
    set(highlights, accent) {
      tints.forEach(clearShells);
      tints = highlights.map(item => ({ id: item.node, color: item.color ?? accent, object: null, shells: [] }));
      for (const [color, look] of looks) if (!tints.some(tint => tint.color === color)) { look.fill.dispose(); look.halo.dispose(); looks.delete(color); }
    },
    update(time, pulsing) {
      for (const tint of tints) {
        const object = resolve(tint.id) ?? null;
        if (object !== tint.object) {
          clearShells(tint); tint.object = object;
          if (object) tint.shells = tintSources(object).map(source => shellOf(source, lookFor(tint.color)));
        }
        if (object) for (const { meshes, source } of tint.shells) { const visible = shown(source, object); for (const mesh of meshes) { mesh.visible = visible; mesh.matrixWorld.copy(source.matrixWorld); } }
      }
      // After the shells, so a look created in this frame is already drawn at the right strength.
      const pulse = pulsing ? (Math.sin(time * PULSE_RATE) + 1) / 2 : 0;
      for (const { fill, halo } of looks.values()) { fill.opacity = FILL_OPACITY + pulse * FILL_PULSE; halo.uniforms.opacity.value = HALO_OPACITY + pulse * HALO_PULSE; }
    },
    get size() { return tints.length; },
    dispose() { root.removeFromParent(); looks.forEach(look => { look.fill.dispose(); look.halo.dispose(); }); looks.clear(); tints = []; },
  };
}
