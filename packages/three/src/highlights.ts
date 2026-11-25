import * as THREE from 'three';

/** A node the renderer tints (`SceneRenderer.setHighlights`), e.g. each thing a viewer can pick up now. */
export interface NodeHighlight {
  /** Scene node to tint; nodes inside it keep their look unless listed too. A node that is not built yet is tinted once it is. */
  node: string;
  /** Tint, a CSS color. Default the palette's accent. */
  color?: string;
}

/** Tint opacity at rest, and the peak added by the pulse while motion runs. */
const TINT_OPACITY = .45, TINT_PULSE = .2, TINT_PULSE_RATE = 3.2;
/** Share of white mixed into the color, so a tint still shows on a model of the same hue. */
const TINT_LIGHTEN = .12;
const WHITE = new THREE.Color('#ffffff');

interface TintShell { mesh: THREE.Mesh; source: THREE.Mesh; }
interface Tint { id: string; color: string; object: THREE.Object3D | null; shells: TintShell[]; }

/** Tints any number of nodes, each with a shell over its opaque meshes, as the selection glow does for one node. */
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
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  let tints: Tint[] = [];
  const materialFor = (color: string) => {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false });
      material.color.set(color).lerp(WHITE, TINT_LIGHTEN); materials.set(color, material);
    }
    return material;
  };
  const clearShells = (tint: Tint) => { root.remove(...tint.shells.map(shell => shell.mesh)); tint.shells = []; };
  const shown = (mesh: THREE.Mesh, object: THREE.Object3D) => {
    if (!mesh.visible && !isDrawn(mesh)) return false;
    for (let current: THREE.Object3D | null = mesh.parent; current; current = current === object ? null : current.parent) if (!current.visible) return false;
    return true;
  };
  return {
    set(highlights, accent) {
      tints.forEach(clearShells);
      tints = highlights.map(item => ({ id: item.node, color: item.color ?? accent, object: null, shells: [] }));
      for (const [color, material] of materials) if (!tints.some(tint => tint.color === color)) { material.dispose(); materials.delete(color); }
    },
    update(time, pulsing) {
      const opacity = TINT_OPACITY + (pulsing ? (Math.sin(time * TINT_PULSE_RATE) + 1) / 2 * TINT_PULSE : 0);
      for (const material of materials.values()) material.opacity = opacity;
      for (const tint of tints) {
        const object = resolve(tint.id) ?? null;
        if (object !== tint.object) {
          clearShells(tint); tint.object = object;
          if (object) tint.shells = tintSources(object).map(source => {
            const mesh = new THREE.Mesh(source.geometry, materialFor(tint.color));
            mesh.matrixAutoUpdate = false; mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.raycast = () => {};
            root.add(mesh); return { mesh, source };
          });
        }
        if (object) for (const { mesh, source } of tint.shells) { mesh.visible = shown(source, object); mesh.matrixWorld.copy(source.matrixWorld); }
      }
    },
    get size() { return tints.length; },
    dispose() { root.removeFromParent(); materials.forEach(material => material.dispose()); materials.clear(); tints = []; },
  };
}
