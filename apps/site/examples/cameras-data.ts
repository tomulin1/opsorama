import { createSceneStore, DEFAULT_CAMERA_SETTINGS, type CameraPath, type CameraSettings, type CameraTransition, type CameraView, type SceneDefinition, type SceneStore } from '@opsorama/core';

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
  // A route-driven node for following: a loop around the storage zone, behind the open ground at the front of the yard.
  { id: 'robot', kind: 'asset', asset: 'mobile-robot', position: [0, 0, -.2], label: 'Mobile robot', labelMode: 'active', selectable: true,
    route: { points: [[0, 0, -.2], [14.5, 0, -.2], [14.5, 0, -8.7], [0, 0, -8.7], [0, 0, -.2]], speed: 1.6, loop: true, profile: { acceleration: 1.2, turnRate: 2.4, cornerRadius: 1.2 } } },
] };

/** The node the example follows. */
export const followTarget = { id: 'robot', label: 'Mobile robot' } as const;

/**
 * A short camera tour: fit the dock and the container from new directions, meet the moving robot where it is when the
 * camera sets off toward it, and fit the whole yard from the default direction. About 7 seconds; with reduced motion each
 * keyframe is a cut at its time.
 */
export const cameraTour: CameraPath = { keyframes: [
  { frame: { nodeId: 'dock', fit: true }, view: { yaw: -.6, pitch: .6 }, seconds: 1.5, hold: .5 },
  { frame: { nodeId: 'container', fit: true }, view: { yaw: .9 }, seconds: 1.5, hold: .5 },
  { frame: { nodeId: 'robot' }, view: { pitch: .9, zoom: 1.6 }, seconds: 1.2, hold: .5 },
  { frame: { nodeId: 'yard', fit: true }, view: { yaw: DEFAULT_CAMERA_SETTINGS.yaw, pitch: DEFAULT_CAMERA_SETTINGS.pitch, zoom: 1 }, seconds: 1.5 },
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
/** One decimal without a minus sign on values that round to zero ("-0.0" reads as a different position). */
const metres = (value: number) => (Math.abs(value) < .05 ? 0 : value).toFixed(1);
/** One line describing a camera view, the same in every adapter. */
export function cameraReadout(projection: CameraSettings['projection'], view: CameraView | null): string {
  if (!view) return 'Camera: not mounted';
  return `${projection} · target ${view.target.map(metres).join(', ')} · yaw ${degrees(view.yaw)} · pitch ${degrees(view.pitch)} · zoom ${view.zoom.toFixed(2)}`;
}
/** Class of the readout element every adapter renders over its scene. */
export const CAMERA_READOUT_CLASS = 'camera-readout';

/** Copyable snippet for the configured camera in each adapter; `touchGestures` adds the mount-time touch option. */
export function cameraSnippet(camera: CameraSettings, transition: CameraTransition, framework: 'react' | 'vue' | 'javascript', touchGestures = false): string {
  const changed = (Object.keys(camera) as (keyof CameraSettings)[]).filter(key => key === 'projection' || key === 'yaw' || key === 'pitch' || key === 'fov' || key === 'controls' && camera.controls !== 'pan');
  const value = (entry: unknown) => typeof entry === 'string' ? `'${entry}'` : typeof entry === 'number' ? String(Math.round(entry * 1000) / 1000) : String(entry);
  const settings = `{ camera: { ${changed.map(key => `${key}: ${value(camera[key])}`).join(', ')} } }`;
  const move = `{ seconds: ${transition.seconds ?? .6}, easing: '${transition.easing ?? 'ease-in-out'}' }`;
  if (framework === 'javascript') return `const store = createSceneStore(definition, ${settings});\nconst renderer = createSceneRenderer(container, store, { assets: catalogAssets${touchGestures ? ', touchGestures: true' : ''} });\nrenderer.onCameraChange(view => console.log(view.target, view.yaw, view.pitch, view.zoom));\nawait renderer.frame('forklift', { fit: true, transition: ${move} });\nawait renderer.overview({ transition: ${move} });\nrenderer.followNode('robot', { heading: 'behind' }).then(end => console.log('Follow ended:', end));\nconst tour = renderer.playCameraPath(cameraTour); // tour.stop() ends it\nconsole.log(await tour.finished);`;
  if (framework === 'react') return `const store = createSceneStore(definition, ${settings});\n\nfunction CameraButtons() {\n  const renderer = useSceneRenderer(), view = useCameraView();\n  return <>\n    <button onClick={() => renderer?.frame('forklift', { fit: true, transition: ${move} })}>\n      Go to forklift (yaw {view?.yaw.toFixed(2)})\n    </button>\n    <button onClick={() => renderer?.followNode('robot')}>Follow robot</button>\n    <button onClick={() => renderer?.playCameraPath(cameraTour)}>Play tour</button>\n  </>;\n}\n\n<DashboardProvider store={store}>\n  <SceneCanvas assets={catalogAssets}${touchGestures ? ' touchGestures' : ''}><CameraButtons /></SceneCanvas>\n</DashboardProvider>`;
  return `const store = createSceneStore(definition, ${settings});\n\nconst CameraButtons = defineComponent({\n  setup() {\n    const renderer = useSceneRenderer(), view = useCameraView();\n    return () => [\n      h('button', { onClick: () => renderer.value?.frame('forklift', { fit: true, transition: ${move} }) },\n        \`Go to forklift (yaw \${view.value?.yaw.toFixed(2)})\`),\n      h('button', { onClick: () => renderer.value?.followNode('robot') }, 'Follow robot'),\n      h('button', { onClick: () => renderer.value?.playCameraPath(cameraTour) }, 'Play tour'),\n    ];\n  },\n});${touchGestures ? `\n\nh(SceneCanvas, { assets: catalogAssets, touchGestures: true }, { default: () => h(CameraButtons) });` : ''}`;
}
