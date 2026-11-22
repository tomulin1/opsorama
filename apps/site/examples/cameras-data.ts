import { createSceneStore, type CameraSettings, type CameraTransition, type CameraView, type SceneDefinition, type SceneStore } from '@opsorama/core';

/** A small yard for the camera example: positions are illustrative, no records are inferred. */
export const camerasDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'yard', kind: 'ground', position: [0, 0, 0], size: [32, 19], color: '#e4ebf2' },
  { id: 'dock-zone', kind: 'zone', position: [-8, 0, -4], size: [12, 7], label: 'DOCK', color: '#deebfb' },
  { id: 'storage-zone', kind: 'zone', position: [7, 0, -4], size: [14, 7], label: 'STORAGE', color: '#dfefe6' },
  { id: 'dock', kind: 'asset', asset: 'loading-dock', variant: 'open', position: [-8, 0, -6], label: 'Loading dock', selectable: true },
  { id: 'truck', kind: 'asset', asset: 'truck', position: [-8, 0, 3.5], rotation: [0, Math.PI, 0], label: 'Truck', selectable: true },
  { id: 'container', kind: 'asset', asset: 'shipping-container', position: [8, 0, -4.5], label: 'Shipping container', selectable: true },
  { id: 'forklift', kind: 'asset', asset: 'forklift', position: [2, 0, 2], label: 'Forklift', selectable: true },
  { id: 'pallet', kind: 'asset', asset: 'pallet', count: 8, position: [4.5, 0, 2.5], label: 'Pallet', selectable: true },
] };

/** Nodes the example's buttons fly to, in order. */
export const cameraStops: readonly { id: string; label: string }[] = [
  { id: 'dock', label: 'Loading dock' }, { id: 'truck', label: 'Truck' }, { id: 'forklift', label: 'Forklift' }, { id: 'container', label: 'Shipping container' },
];

/** Everything a mount needs: the store the host configures and the disposal of the scene and store. */
export interface CameraSession { store: SceneStore; dispose(): void; }
/** The store of one mount. Motion stays on so transitions animate; shadows off keeps the example light. */
export const makeCamerasStore = (camera: Partial<CameraSettings>) => createSceneStore(camerasDefinition, { shadows: false, camera });

/** Degrees with one decimal, for readouts. */
const degrees = (radians: number) => `${(radians * 180 / Math.PI).toFixed(1)}°`;
/** One line describing a camera view, the same in every adapter. */
export function cameraReadout(projection: CameraSettings['projection'], view: CameraView | null): string {
  if (!view) return 'Camera: not mounted';
  return `${projection} · target ${view.target.map(value => value.toFixed(1)).join(', ')} · yaw ${degrees(view.yaw)} · pitch ${degrees(view.pitch)} · zoom ${view.zoom.toFixed(2)}`;
}
/** Class of the readout element every adapter renders over its scene. */
export const CAMERA_READOUT_CLASS = 'camera-readout';

/** Copyable snippet for the configured camera in each adapter. */
export function cameraSnippet(camera: CameraSettings, transition: CameraTransition, framework: 'react' | 'vue' | 'javascript'): string {
  const changed = (Object.keys(camera) as (keyof CameraSettings)[]).filter(key => key === 'projection' || key === 'yaw' || key === 'pitch' || key === 'fov');
  const value = (entry: unknown) => typeof entry === 'string' ? `'${entry}'` : typeof entry === 'number' ? String(Math.round(entry * 1000) / 1000) : String(entry);
  const settings = `{ camera: { ${changed.map(key => `${key}: ${value(camera[key])}`).join(', ')} } }`;
  const move = `{ seconds: ${transition.seconds ?? .6}, easing: '${transition.easing ?? 'ease-in-out'}' }`;
  if (framework === 'javascript') return `const store = createSceneStore(definition, ${settings});\nconst renderer = createSceneRenderer(container, store, { assets: catalogAssets });\nrenderer.onCameraChange(view => console.log(view.target, view.yaw, view.pitch, view.zoom));\nawait renderer.frame('forklift', { fit: true, transition: ${move} });\nawait renderer.overview({ transition: ${move} });`;
  if (framework === 'react') return `const store = createSceneStore(definition, ${settings});\n\nfunction CameraButtons() {\n  const renderer = useSceneRenderer(), view = useCameraView();\n  return <button onClick={() => renderer?.frame('forklift', { fit: true, transition: ${move} })}>\n    Go to forklift (yaw {view?.yaw.toFixed(2)})\n  </button>;\n}\n\n<DashboardProvider store={store}>\n  <SceneCanvas assets={catalogAssets}><CameraButtons /></SceneCanvas>\n</DashboardProvider>`;
  return `const store = createSceneStore(definition, ${settings});\n\nconst CameraButtons = defineComponent({\n  setup() {\n    const renderer = useSceneRenderer(), view = useCameraView();\n    return () => h('button', { onClick: () => renderer.value?.frame('forklift', { fit: true, transition: ${move} }) },\n      \`Go to forklift (yaw \${view.value?.yaw.toFixed(2)})\`);\n  },\n});`;
}
