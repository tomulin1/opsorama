import { DEFAULT_MAX_FRAME_STEPS, MAX_FRAME_STEPS, SCENE_POINTER_EVENT_TYPES } from '@opsorama/three';
import type { DocArticle } from './content';

/** Engine hooks: pointer events, the frame hook and renderer plugins, with their React and Vue forms. */
export const engineHooksArticle: DocArticle = {
  slug: 'engine-hooks', title: 'Engine hooks', category: 'FOUNDATIONS',
  description: 'Extend the renderer from host code: pointer events with the node, its containers and the world point under the pointer, a frame hook once per frame or on a fixed simulation step, and renderer plugins that add their own Three.js objects, in plain JavaScript, React and Vue.',
  sections: [
    { id: 'pointer', title: 'Pointer events', paragraphs: [
      `RendererOptions.onPointer receives a ScenePointerEvent for ${SCENE_POINTER_EVENT_TYPES.join(', ')}. down and up report every press and release over the canvas or a label, also when the press starts a drag. click follows a press and release that moved less than 5 px, or a touch tap. enter and leave report a change of the nearest node under the pointer, checked when the pointer moves or leaves the scene (a node moving under a resting pointer reports nothing). move reports the pointer position at most once per animation frame, also during a drag.`,
      'Each event names the nearest node under the pointer, whether it is selectable or not: grounds, zones and paths count, so a click on the floor reports the ground. nodeId is null over empty space. ancestors lists the containers along the parentId chain, nearest first. point is the world point in metres where the ray hits the node; on a miss it is where the ray meets the ground plane y = 0, or null when the ray never reaches it. For a label the node is the labelled node and point is its world position. The event also carries entityId, pointerType (mouse, touch or pen; a keyboard-activated label counts as mouse), the DOM button (-1 for move, enter and leave), the shift, ctrl, alt and meta keys, and source: canvas or label.',
      'After a click the renderer selects the node (or clears the selection over a node that is not selectable) and frames it, as without a handler. A click handler that calls event.preventSelection() skips both; on other event types it has no effect. Over a pick target (setPickTargets, used by move mode) the target takes the input and no event is reported. Events start with the first drawn frame. A throwing handler is reported to onError.',
    ], code: `const renderer = createSceneRenderer(container, store, {
  assets: catalogAssets,
  onPointer: event => {
    if (event.type !== 'click' || event.nodeId !== 'yard' || !event.point) return;
    event.preventSelection(); // keep the selection and the camera
    store.upsert({ ...robot, route: { points: [robot.position, event.point], speed: 2.4 } });
  },
});`, language: 'typescript' },
    { id: 'frame', title: 'Frame hook', paragraphs: [
      'renderer.onFrame(listener, options?) calls the listener from the frame loop with a SceneFrame and returns the unsubscribe function, which is safe to call more than once and from inside a listener. Without a step the listener runs once per rendered frame, after node motion and the camera move and before labels are placed and the frame is drawn: what it changes is drawn in the same frame. delta is the real frame time, capped at 0.05 s like node motion, times SceneSettings.speed, and 0 while paused.',
      `With step (1/240 to 1/10 s, for example 1 / 60) the listener runs on a fixed simulation step before node motion. Real frame time times speed accumulates, and the listener runs once per whole step, so its scene time follows the scene clock however fast the display draws. At most maxSteps steps run per frame (default ${DEFAULT_MAX_FRAME_STEPS}, at most ${MAX_FRAME_STEPS}); time beyond that is dropped and reported in SceneFrame.dropped. Fixed steps do not run while the scene is paused or the document is hidden, and keep running with motion off or reduced motion: frame.animated says whether node motion animates, so a listener can snap instead of animating.`,
      'time is the scene time the listener has seen since it subscribed and frame counts its calls (steps for a fixed-step listener). Listeners start with the first drawn frame. A throwing listener is reported to onError and the loop continues. An invalid listener, step or maxSteps throws an error that names the allowed range.',
    ], code: `const stop = renderer.onFrame(frame => {
  simulation.advance(frame.delta); // always 1 / 60 scene seconds
  if (frame.dropped) console.warn('Simulation fell behind by', frame.dropped, 's');
}, { step: 1 / 60, maxSteps: 8 });

renderer.onFrame(frame => { gauge.rotation.y += frame.delta; }); // once per rendered frame
stop();`, language: 'typescript' },
    { id: 'plugins', title: 'Renderer plugins', paragraphs: [
      'A RendererPlugin is { name, setup(context) } passed in RendererOptions.plugins. Plugins are set up once, in order, after the renderer\'s first scene sync; during a sliced initial load only part of the scene may be built, so await context.loaded before reading all nodes. setup may return a cleanup. When the renderer is disposed the cleanups run once in reverse order, before the renderer releases its own resources; a throwing cleanup is reported to onError and the others still run.',
      'The context gives the Three.js scene, the WebGLRenderer, the container, the store, camera() (the camera drawn now: call it each time, because a projection change swaps it), nodeObject(id) (the built object of a node, or null; read only and rebuilt when the node changes, so look it up again; instanced meshes are hidden proxies with current transforms), loaded, onFrame, onCameraChange and reportError (to onError, prefixed with the plugin name). Objects a plugin adds are its own: remove and dispose them in the cleanup. Do not replace the render call or dispose the WebGLRenderer.',
      'Plugin names must be unique; a duplicate name, a missing name or a missing setup throws before anything is created. When a setup throws, the cleanups of the plugins set up so far run, the renderer is disposed and createSceneRenderer throws an error that names the plugin, with the original error as its cause. plugins is a mount-time option.',
    ], code: `const ring: RendererPlugin = {
  name: 'destination-ring',
  setup(context) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.55, .78, 48), new THREE.MeshBasicMaterial({ color: '#2f6fde' }));
    mesh.rotation.x = -Math.PI / 2; context.scene.add(mesh);
    const stop = context.onFrame(frame => mesh.scale.setScalar(1 + .1 * Math.sin(frame.time * 5)));
    return () => { stop(); mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); };
  },
};
const renderer = createSceneRenderer(container, store, { assets: catalogAssets, plugins: [ring] });`, language: 'typescript' },
    { id: 'adapters', title: 'React and Vue', paragraphs: [
      'SceneCanvas takes onPointer and plugins in both adapters. In React, onPointer is read through a ref, so an inline function takes effect without remounting the renderer; in Vue, listen to the validated pointer event (@pointer, or onPointer in a render function). plugins is mount-time: keep the array stable (a module constant, useMemo, or a constant in setup), because a new array remounts the renderer.',
      'useSceneFrame(listener, options?) subscribes a frame listener to the renderer of the provider\'s SceneCanvas once it has mounted, follows a remounted renderer and unsubscribes on unmount; it does nothing during server rendering. React calls the latest listener without resubscribing; a change of step or maxSteps resubscribes. In Vue, options may be a ref or getter. Invalid options throw during render or setup.',
    ], code: `// React
const plugins = [ring]; // module constant: stable across renders
function Steps() {
  const output = useRef<HTMLOutputElement>(null);
  useSceneFrame(frame => { output.current!.textContent = String(frame.frame); }, { step: 1 / 60 });
  return <output ref={output} />;
}
<SceneCanvas assets={catalogAssets} plugins={plugins} onPointer={event => console.log(event.type, event.nodeId)}>
  <Steps />
</SceneCanvas>

// Vue
useSceneFrame(frame => { steps.value = frame.frame; }, { step: 1 / 60 });
h(SceneCanvas, { assets: catalogAssets, plugins, onPointer: (event: ScenePointerEvent) => console.log(event.type) });`, language: 'tsx' },
    { id: 'example', title: 'Live example', paragraphs: [
      'The live example at /examples/engine-hooks sends a robot to a clicked floor point with preventSelection, draws a pulsing destination ring from a renderer plugin, and counts fixed simulation steps that stop while paused, follow the speed and continue with motion off, in React, Vue and plain JavaScript.',
    ] },
  ],
};
