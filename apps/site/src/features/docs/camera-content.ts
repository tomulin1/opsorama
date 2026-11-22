import { CAMERA_CONTROLS, CAMERA_FOV_RANGE, CAMERA_OVERVIEWS, CAMERA_PITCH_RANGE, CAMERA_PROJECTIONS, DEFAULT_CAMERA_SETTINGS, DEFAULT_CAMERA_TRANSITION, ZOOM_RANGE } from '@opsorama/core';
import type { DocArticle } from './content';

const rounded = (value: number) => String(Math.round(value * 1000) / 1000);

/** The camera: settings, projection, views and transitions, framing, events and the adapter hooks. */
export const cameraArticle: DocArticle = {
  slug: 'camera', title: 'Camera', category: 'FOUNDATIONS',
  description: 'Orthographic or perspective projection, the overview direction, controls and framing in SceneSettings.camera, and the renderer camera API: read and set views, timed transitions, frame and overview, change events and the React and Vue hooks.',
  sections: [
    { id: 'settings', title: 'Camera settings', paragraphs: [
      'SceneSettings.camera configures the camera. The defaults draw the orthographic overview every scene has always had: the camera looks at its target from the offset [16, 22, 30]. store.configure({ camera }) replaces the whole camera object and resets omitted fields to DEFAULT_CAMERA_SETTINGS, like palette; spread the current value to change one field. Invalid values throw an error that names the field and the allowed values.',
    ], headers: ['Field', 'Type', 'Default', 'Behavior'], rows: [
      ['projection', CAMERA_PROJECTIONS.map(value => `'${value}'`).join(' | '), `'${DEFAULT_CAMERA_SETTINGS.projection}'`, 'Applied on the next frame; the target and angles stay.'],
      ['controls', CAMERA_CONTROLS.map(value => `'${value}'`).join(' | '), `'${DEFAULT_CAMERA_SETTINGS.controls}'`, 'pan: the primary mouse button drags the view over the ground. none: no dragging; clicks and taps still select. Wheel zoom is the separate wheelZoom option.'],
      ['fov', `number (${CAMERA_FOV_RANGE.min}–${CAMERA_FOV_RANGE.max})`, String(DEFAULT_CAMERA_SETTINGS.fov), 'Vertical field of view in degrees, perspective only.'],
      ['yaw', 'number (radians, finite)', `${rounded(DEFAULT_CAMERA_SETTINGS.yaw)} (atan2(16, 30))`, 'Overview heading: 0 looks from +Z toward −Z, π/2 from +X toward −X. A change turns the camera at once and keeps its target.'],
      ['pitch', `number (radians, ${CAMERA_PITCH_RANGE.min}–${CAMERA_PITCH_RANGE.max})`, `${rounded(DEFAULT_CAMERA_SETTINGS.pitch)} (atan2(22, 34))`, 'Overview elevation, from almost level to almost straight down. Changes like yaw.'],
      ['overview', CAMERA_OVERVIEWS.map(value => `'${value}'`).join(' | '), `'${DEFAULT_CAMERA_SETTINGS.overview}'`, 'ground: the first ground node, at a scale that fits the largest ground. bounds: every built node, fitted when the overview is applied (after the initial load, on overview() and when the selection is cleared). Takes effect at the next overview.'],
      ['frameOnSelect', 'boolean', String(DEFAULT_CAMERA_SETTINGS.frameOnSelect), 'Selecting a node moves the camera to it; clearing the selection moves it back to the overview target. false leaves the camera where it is.'],
    ], code: `import { createSceneStore } from '@opsorama/core';

const store = createSceneStore(definition, { camera: { projection: 'perspective', fov: 40 } });
// Change one field: spread the current camera, or omitted fields return to their defaults.
store.configure({ camera: { ...store.getSnapshot().settings.camera, yaw: Math.PI / 2 } });`, language: 'typescript' },
    { id: 'projection', title: 'Orthographic and perspective', paragraphs: [
      `SceneSettings.zoom (${ZOOM_RANGE.min}–${ZOOM_RANGE.max}) is the single zoom for both projections. At zoom 1 both show the same area at the target: the orthographic camera scales its view, and the perspective camera stands at the distance where its field of view covers that area, divided by the zoom. Wheel zoom, useSceneZoom and ZoomControl keep working in both.`,
      'The perspective camera sets its near and far planes from its distance and the size of the scene. HTML labels and markers whose anchor lies behind the camera or outside its depth range are hidden instead of being mirrored into the view. Panning keeps the grabbed ground point under the pointer in both projections.',
    ] },
    { id: 'views', title: 'Read and set the view', paragraphs: [
      'renderer.getCameraView() returns the view as drawn: target (metres), yaw within (−π, π], pitch and zoom. renderer.setCameraView(view, transition?) moves the camera; omitted fields keep their current values, and the scale at zoom 1 (the overview, or a node framed with fit) stays. Without a transition it is a cut. A changed zoom is written to SceneSettings.zoom when the camera arrives, so ZoomControl and useSceneZoom follow it.',
      `A CameraTransition has seconds (0–10, default ${DEFAULT_CAMERA_TRANSITION.seconds}; 0 is a cut) and easing ('ease-in-out', the default, or 'linear'). Transitions run on real time, independent of speed and paused. With reduced motion, motion: false or during the initial load every move is a cut. A drag, frame, overview, clearing the selection, a zoom change from elsewhere (wheel or a control) or another transition interrupts a running one where it is.`,
      'Every move returns a promise of \'completed\' or \'interrupted\'. renderer.onCameraChange(listener) calls the listener with the new view after each rendered frame in which the view changed, at most once per frame, and returns the unsubscribe function.',
    ], code: `const result = await renderer.setCameraView({ yaw: Math.PI / 4, pitch: 0.8, zoom: 1.5 }, { seconds: 1 });
if (result === 'interrupted') console.log('The user took over the camera.');

const stop = renderer.onCameraChange(view => {
  console.log(view.target, view.yaw, view.pitch, view.zoom);
});
// Later:
stop();`, language: 'typescript' },
    { id: 'framing', title: 'Frame nodes and return to the overview', paragraphs: [
      'renderer.frame(id, { fit?, transition? }) moves the camera to a node from the current direction. With fit the node\'s bounds fill the view; without it the node is centred at the current scale (the orthographic camera at the overview scale moves only about half way, keeping more of the scene in view). Without a transition a centred node is glided to and a fitted node is cut to, as in earlier versions. An unknown or hidden node leaves the camera alone and resolves \'interrupted\'.',
      'renderer.overview({ transition? }) clears the selection and returns to the overview target, the yaw and pitch from the settings, and the overview scale. Without a transition the target glides there and the direction and scale change at once.',
    ], code: `await renderer.frame('forklift', { fit: true, transition: { seconds: 1.2 } });
await renderer.overview({ transition: { seconds: 1.2, easing: 'linear' } });`, language: 'typescript' },
    { id: 'adapters', title: 'React and Vue', paragraphs: [
      'DashboardProvider holds the renderer of its SceneCanvas, so any component under the provider reaches the camera without onReady. useSceneRenderer() returns the renderer (React: SceneRenderer | null; Vue: a read-only shallow ref), null before the canvas mounts, after it unmounts and during server rendering. useCameraView() returns the current CameraView (or null) and updates at most once per rendered frame while the view changes. onReady and @ready still receive the renderer.',
      'One provider drives one canvas: a second SceneCanvas under the same provider shows an error that names the fix (give each canvas its own provider and store) and reports it through onError. A NodePreview has its own camera and does not count.',
    ], code: `import { useCameraView, useSceneRenderer } from '@opsorama/react';

function CameraButtons() {
  const renderer = useSceneRenderer(), view = useCameraView();
  return <button disabled={!renderer} onClick={() => renderer?.frame('forklift', { fit: true, transition: {} })}>
    Go to forklift (yaw {view?.yaw.toFixed(2)})
  </button>;
}`, language: 'tsx' },
    { id: 'limits', title: 'Limits', paragraphs: [
      'Orbit controls, following a moving node, camera paths and touch gestures are planned and not implemented yet: the camera turns only through the yaw and pitch settings and setCameraView, and touch input selects but does not pan. The live example at /examples/cameras shows projection, direction, field of view and transitions in React, Vue and plain JavaScript.',
    ] },
  ],
};
