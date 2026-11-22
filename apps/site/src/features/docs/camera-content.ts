import { CAMERA_CONTROLS, CAMERA_FOLLOW_DISTANCE, CAMERA_FOLLOW_HEADINGS, CAMERA_FOV_RANGE, CAMERA_KEYFRAME_SECONDS, MAX_CAMERA_KEYFRAMES, CAMERA_OVERVIEWS, CAMERA_PITCH_RANGE, CAMERA_PROJECTIONS, DEFAULT_CAMERA_SETTINGS, DEFAULT_CAMERA_TRANSITION, ZOOM_RANGE } from '@opsorama/core';
import type { DocArticle } from './content';

const rounded = (value: number) => String(Math.round(value * 1000) / 1000);

/** The camera: settings, projection, views and transitions, framing, orbit, following, camera paths, events and the adapter hooks. */
export const cameraArticle: DocArticle = {
  slug: 'camera', title: 'Camera', category: 'FOUNDATIONS',
  description: 'Orthographic or perspective projection, the overview direction, pan and orbit controls and framing in SceneSettings.camera, and the renderer camera API: read and set views, timed transitions, frame and overview, following a node, camera paths, change events and the React and Vue hooks.',
  sections: [
    { id: 'settings', title: 'Camera settings', paragraphs: [
      'SceneSettings.camera configures the camera. The defaults draw the orthographic overview every scene has always had: the camera looks at its target from the offset [16, 22, 30]. store.configure({ camera }) replaces the whole camera object and resets omitted fields to DEFAULT_CAMERA_SETTINGS, like palette; spread the current value to change one field. Invalid values throw an error that names the field and the allowed values.',
    ], headers: ['Field', 'Type', 'Default', 'Behavior'], rows: [
      ['projection', CAMERA_PROJECTIONS.map(value => `'${value}'`).join(' | '), `'${DEFAULT_CAMERA_SETTINGS.projection}'`, 'Applied on the next frame; the target and angles stay.'],
      ['controls', CAMERA_CONTROLS.map(value => `'${value}'`).join(' | '), `'${DEFAULT_CAMERA_SETTINGS.controls}'`, 'pan: the primary mouse button drags the view over the ground. orbit: panning as with pan, and a right-button drag or a Ctrl + primary-button drag turns the view around its target. none: no dragging; clicks and taps still select. Wheel zoom is the separate wheelZoom option.'],
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
    { id: 'orbit', title: 'Orbit', paragraphs: [
      'With controls: \'orbit\', a right-button drag or a Ctrl + primary-button drag on the canvas turns the view around its current target: dragging sideways changes the yaw (half a turn per viewport height dragged) and dragging up or down changes the pitch, kept within 0.05–1.55 radians. A plain primary drag still pans. The browser context menu over the canvas is suppressed only while orbit is set; with pan or none a right click behaves as usual. A Ctrl click without movement still selects.',
      'An orbit changes the drawn view like setCameraView, not the yaw and pitch settings, so overview() returns to the settings. It interrupts a running transition or camera path and keeps following. The canvas takes no keyboard focus: give keyboard users controls of their own that call setCameraView, for example buttons that turn the yaw by 15 degrees. Touch orbit is not implemented yet.',
    ], code: `store.configure({ camera: { ...store.getSnapshot().settings.camera, controls: 'orbit' } });

// A keyboard-accessible host control that turns the view.
turnLeft.addEventListener('click', () => {
  const view = renderer.getCameraView();
  void renderer.setCameraView({ yaw: view.yaw + Math.PI / 12 }, { seconds: 0.3 });
});`, language: 'typescript' },
    { id: 'follow', title: 'Follow a node', paragraphs: [
      `renderer.followNode(id, { distance?, heading? }) keeps the camera on a node: every frame the target moves to the node's world position, so routes, controllers, transfers and carriers are followed. The camera glides onto the node like a framed node and snaps with reduced motion. heading is ${CAMERA_FOLLOW_HEADINGS.map(value => `'${value}'`).join(' or ')}: fixed keeps the direction; behind also turns the yaw, smoothed, to look along the node's heading from behind it (the node's local +Z is its front). distance (${CAMERA_FOLLOW_DISTANCE.min}–${CAMERA_FOLLOW_DISTANCE.max} m) sets the scale so that the perspective camera stands that far from the node at the current zoom; the orthographic camera shows the same area. Without it the scale stays.`,
      'An orbit turns around the followed node and keeps following; with behind the orbit is kept as an offset from the heading. A pan, frame, overview, setCameraView, a camera path or a selection change that moves the camera ends following with \'interrupted\'; removing or hiding the node ends it with \'removed\' (also at once for an unknown node or one not built yet, so await renderer.loaded first); followNode(null), another followNode call and dispose end it with \'stopped\'. The returned promise resolves with that reason, and getFollowedNode() returns the followed ID or null.',
    ], code: `await renderer.loaded;
const ended = renderer.followNode('robot', { heading: 'behind', distance: 18 });
ended.then(reason => console.log('Following ended:', reason)); // 'stopped' | 'interrupted' | 'removed'
// Later:
void renderer.followNode(null);`, language: 'typescript' },
    { id: 'paths', title: 'Camera paths', paragraphs: [
      `renderer.playCameraPath(path) plays a CameraPath: 1–${MAX_CAMERA_KEYFRAMES} keyframes and an optional loop. The camera travels for seconds (${CAMERA_KEYFRAME_SECONDS.min}–${CAMERA_KEYFRAME_SECONDS.max}; 0 is a cut) from the previous keyframe (or the current view) to each keyframe on its easing, then holds it for hold seconds. A keyframe gives a view (target, yaw, pitch, zoom; omitted fields keep the previous keyframe's values), a frame ({ nodeId, fit? }) or both; frame takes the target, and with fit the scale, from the node when the camera sets off toward it, so a moving node is met where it is then. view.target cannot be combined with frame. With loop the path starts again from the first keyframe after the last hold until it is stopped.`,
      'Paths run on real seconds, independent of speed and paused. With reduced motion or motion: false the camera cuts to each keyframe at the time it is reached. The call returns { stop(), finished }: finished resolves \'completed\' after the last hold (never for a loop) and \'interrupted\' when stop() is called, when a drag, frame, overview, setCameraView, followNode, a zoom change from elsewhere or a new path takes over, or when a framed node is unknown or hidden. A changed zoom is written to SceneSettings.zoom when the path ends. A path interrupts a running transition and ends following.',
      'validateCameraPath(path) from @opsorama/core throws an error that starts with the JSON Pointer of the offending value and names the fix, for example "Camera path /keyframes/1/seconds: set the travel time in seconds from 0 to 60; 0 is a cut." playCameraPath runs it first. Camera paths are host data for the renderer, not part of a scene definition or its JSON Schema.',
    ], code: `import { validateCameraPath, type CameraPath } from '@opsorama/core';

const tour: CameraPath = { keyframes: [
  { frame: { nodeId: 'dock', fit: true }, view: { yaw: -0.6 }, seconds: 1.5, hold: 0.5 },
  { frame: { nodeId: 'robot' }, view: { pitch: 0.9, zoom: 1.6 }, seconds: 1.2, hold: 0.5 },
  { view: { target: [0, 0, 0], yaw: 0.49, zoom: 1 }, seconds: 1.5, easing: 'linear' },
] };
validateCameraPath(tour);
const playback = renderer.playCameraPath(tour);
stopButton.addEventListener('click', () => playback.stop());
console.log(await playback.finished); // 'completed' or 'interrupted'`, language: 'typescript' },
    { id: 'adapters', title: 'React and Vue', paragraphs: [
      'DashboardProvider holds the renderer of its SceneCanvas, so any component under the provider reaches the camera without onReady. useSceneRenderer() returns the renderer (React: SceneRenderer | null; Vue: a read-only shallow ref), null before the canvas mounts, after it unmounts and during server rendering. useCameraView() returns the current CameraView (or null) and updates at most once per rendered frame while the view changes. onReady and @ready still receive the renderer.',
      'One provider drives one canvas: a second SceneCanvas under the same provider shows an error that names the fix (give each canvas its own provider and store) and reports it through onError. A NodePreview has its own camera and does not count.',
      'Following and camera paths need no adapter API: call followNode and playCameraPath on the renderer from useSceneRenderer(), and keep the returned promise or playback to show the state and to stop it.',
    ], code: `import { useState } from 'react';
import type { CameraPath } from '@opsorama/core';
import type { CameraPathPlayback } from '@opsorama/three';
import { useCameraView, useSceneRenderer } from '@opsorama/react';

function CameraButtons({ tour }: { tour: CameraPath }) {
  const renderer = useSceneRenderer(), view = useCameraView();
  const [playback, setPlayback] = useState<CameraPathPlayback | null>(null);
  return <>
    <button disabled={!renderer} onClick={() => renderer?.frame('forklift', { fit: true, transition: {} })}>
      Go to forklift (yaw {view?.yaw.toFixed(2)})
    </button>
    <button disabled={!renderer} onClick={() => void renderer?.followNode('robot', { heading: 'behind' })}>Follow robot</button>
    <button disabled={!renderer} onClick={() => setPlayback(renderer?.playCameraPath(tour) ?? null)}>Play tour</button>
    <button disabled={!playback} onClick={() => playback?.stop()}>Stop tour</button>
  </>;
}`, language: 'tsx' },
    { id: 'limits', title: 'Limits', paragraphs: [
      'Touch gestures are planned and not implemented yet: touch input selects but does not pan, zoom or orbit, and orbit needs a mouse. The canvas takes no keyboard focus; keyboard camera control is up to host controls that call setCameraView. The live example at /examples/cameras shows projection, direction, field of view, orbit, transitions, following a route-driven robot and a camera tour in React, Vue and plain JavaScript.',
    ] },
  ],
};
