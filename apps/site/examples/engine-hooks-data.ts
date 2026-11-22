import * as THREE from 'three';
import { createSceneStore, type AssetNode, type SceneDefinition, type SceneSettings, type SceneStore, type Vec3 } from '@opsorama/core';
import type { RendererPlugin, SceneFrame, ScenePointerEvent, SceneRenderer } from '@opsorama/three';

/** A small yard for the engine hooks example: positions are illustrative, no records are inferred. */
export const engineHooksDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'yard', kind: 'ground', position: [0, 0, 0], size: [28, 16], color: '#e4ebf2' },
  { id: 'charging-zone', kind: 'zone', position: [-9, 0, -3.5], size: [8, 6], label: 'CHARGING', color: '#deebfb' },
  { id: 'storage-zone', kind: 'zone', position: [7, 0, -3.5], size: [12, 6], label: 'STORAGE', color: '#dfefe6' },
  { id: 'charger', kind: 'asset', asset: 'ev-charger', position: [-11, 0, -5.5], label: 'Charger', selectable: true },
  { id: 'rack', kind: 'asset', asset: 'pallet-rack', position: [7, 0, -5], label: 'Pallet rack', selectable: true },
  { id: 'robot', kind: 'asset', asset: 'mobile-robot', position: [-8, 0, -3], label: 'Mobile robot', selectable: true },
] };

/** The node a click on the floor sends. */
export const ROBOT_ID = 'robot';
/** Step of the example's fixed-step listener, in scene seconds. */
export const FIXED_STEP = 1 / 60;
/** Half the ground size minus a margin, so the robot stays on the yard. */
const REACH: readonly [number, number] = [13, 7.4];

/** The store of one mount. Shadows off keeps the example light; motion stays on so the robot drives. */
export const makeEngineHooksStore = (settings: Partial<SceneSettings> = {}): SceneStore => createSceneStore(engineHooksDefinition, { shadows: false, ...settings });

/** Where the robot was last sent, shared by the click handler and the destination ring plugin of one mount. */
export interface RobotDispatch { destination: Vec3 | null; trips: number }
export const createRobotDispatch = (): RobotDispatch => ({ destination: null, trips: 0 });

/**
 * Sends the robot to a clicked point on the floor (the ground or a zone) with a route from its last destination; the
 * route follower joins it from wherever the robot is. Such a click calls `preventSelection()`: the floor is not
 * selectable, so the default would clear the selection and return the camera to the overview. Returns whether the click
 * was a floor click.
 */
export function sendRobot(store: SceneStore, dispatch: RobotDispatch, event: ScenePointerEvent): boolean {
  if (event.type !== 'click' || !event.nodeId || !event.point) return false;
  const nodes = store.getSnapshot().nodes, floor = nodes.find(node => node.id === event.nodeId);
  if (floor?.kind !== 'ground' && floor?.kind !== 'zone') return false;
  event.preventSelection();
  const robot = nodes.find((node): node is AssetNode => node.id === ROBOT_ID && node.kind === 'asset');
  if (!robot) return true;
  const to: Vec3 = [Math.max(-REACH[0], Math.min(REACH[0], event.point[0])), 0, Math.max(-REACH[1], Math.min(REACH[1], event.point[2]))];
  const from = dispatch.destination ?? robot.position ?? [0, 0, 0];
  // A click on the current destination changes nothing; a route needs two distinct points.
  if (Math.hypot(to[0] - from[0], to[2] - from[2]) < .3) return true;
  store.upsert({ ...robot, route: { points: [from, to], speed: 2.4, profile: { acceleration: 1.6, turnRate: 3 } } });
  dispatch.destination = to; dispatch.trips++;
  return true;
}

/** Name of the ring mesh the plugin adds to the Three.js scene. */
export const DESTINATION_RING_NAME = 'destination-ring';

/**
 * A renderer plugin: a pulsing ring on the robot's destination. It adds one mesh to the Three.js scene, moves it from a
 * per-frame listener (still with motion off or reduced) and removes and disposes it in its cleanup. `lifecycle` reports
 * setup and cleanup so the page can show them.
 */
export function destinationRingPlugin(dispatch: RobotDispatch, lifecycle: (event: 'setup' | 'cleanup') => void = () => undefined): RendererPlugin {
  return {
    name: 'destination-ring',
    setup(context) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .78, 48), new THREE.MeshBasicMaterial({ color: '#2f6fde', transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide }));
      ring.name = DESTINATION_RING_NAME; ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false;
      context.scene.add(ring);
      const stop = context.onFrame(frame => {
        const target = dispatch.destination; ring.visible = target !== null;
        if (!target) return;
        ring.position.set(target[0], .05, target[2]);
        ring.scale.setScalar(frame.animated ? 1 + .12 * Math.sin(frame.time * 5) : 1);
      });
      lifecycle('setup');
      return () => { stop(); ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); lifecycle('cleanup'); };
    },
  };
}

/** Classes of the readouts every adapter renders over its scene. */
export const STEP_READOUT_CLASS = 'engine-step-readout', CLICK_READOUT_CLASS = 'engine-click-readout', HOVER_READOUT_CLASS = 'engine-hover-readout';

/** The fixed-step readout: steps and scene seconds the listener has seen. */
export function stepReadout(frame: SceneFrame | null): string {
  if (!frame) return 'Fixed steps (1/60 s): waiting for the first frame';
  return `Fixed steps (1/60 s): ${frame.frame} · scene time ${frame.time.toFixed(2)} s${frame.dropped ? ` · dropped ${frame.dropped.toFixed(3)} s` : ''}`;
}
const coordinates = (point: Vec3 | null) => point ? point.map(value => value.toFixed(1)).join(', ') : 'none';
/** The last click: node (or empty space), containers, world point, source and whether the robot was sent. */
export function clickReadout(event: ScenePointerEvent | null, sent = false): string {
  if (!event) return 'Last click: none yet. Click the floor to send the robot.';
  return `Last click: ${event.nodeId ?? 'empty space'}${event.ancestors.length ? ` in ${event.ancestors.join(' › ')}` : ''} at ${coordinates(event.point)} (${event.source}, ${event.pointerType})${sent ? ' · robot sent' : ''}`;
}
/** The node under the pointer, from `enter` and `leave`. */
export const hoverReadout = (nodeId: string | null) => `Pointer over: ${nodeId ?? 'nothing'}`;

/** Everything a mount needs: the store the page configures, and the disposal of the scene and store. */
export interface EngineHooksSession { store: SceneStore; dispose(): void }
/** Callbacks from a mount to the page. */
export interface EngineHooksCallbacks { ready(renderer: SceneRenderer): void; lifecycle(event: 'setup' | 'cleanup'): void }

/** Copyable snippet of the three hooks in each adapter. */
export function engineHooksSnippet(framework: 'react' | 'vue' | 'javascript'): string {
  const plugin = `const ring: RendererPlugin = {\n  name: 'destination-ring',\n  setup(context) {\n    const mesh = new THREE.Mesh(new THREE.RingGeometry(.55, .78, 48), new THREE.MeshBasicMaterial({ color: '#2f6fde' }));\n    mesh.rotation.x = -Math.PI / 2; context.scene.add(mesh);\n    const stop = context.onFrame(frame => mesh.scale.setScalar(1 + .1 * Math.sin(frame.time * 5)));\n    return () => { stop(); mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); };\n  },\n};`;
  const click = `event => {\n  if (event.type !== 'click' || event.nodeId !== 'yard' || !event.point) return;\n  event.preventSelection(); // keep the selection and the camera\n  store.upsert({ ...robot, route: { points: [from, event.point], speed: 2.4 } });\n}`;
  if (framework === 'javascript') return `${plugin}\n\nconst renderer = createSceneRenderer(container, store, {\n  assets: catalogAssets, plugins: [ring],\n  onPointer: ${click.replace(/\n/g, '\n  ')},\n});\nconst stop = renderer.onFrame(frame => { steps.textContent = String(frame.frame); }, { step: 1 / 60 });`;
  if (framework === 'react') return `${plugin}\nconst plugins = [ring]; // stable: a new array remounts the renderer\n\nfunction Steps() {\n  const output = useRef<HTMLOutputElement>(null);\n  useSceneFrame(frame => { output.current!.textContent = String(frame.frame); }, { step: 1 / 60 });\n  return <output ref={output} />;\n}\n\n<SceneCanvas assets={catalogAssets} plugins={plugins}\n  onPointer={${click.replace(/\n/g, '\n  ')}}>\n  <Steps />\n</SceneCanvas>`;
  return `${plugin}\nconst plugins = [ring];\n\nconst Steps = defineComponent({\n  setup() {\n    const steps = ref(0);\n    useSceneFrame(frame => { steps.value = frame.frame; }, { step: 1 / 60 });\n    return () => h('output', steps.value);\n  },\n});\n\nh(SceneCanvas, { assets: catalogAssets, plugins,\n  onPointer: ${click.replace(/\n/g, '\n  ')},\n}, { default: () => h(Steps) });`;
}
