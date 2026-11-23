'use client';
import { useEffect, useRef, useState } from 'react';
import { CAMERA_EASINGS, CAMERA_FOV_RANGE, CAMERA_PROJECTIONS, DEFAULT_CAMERA_SETTINGS, DEFAULT_CAMERA_TRANSITION, type CameraEasing, type CameraFollowHeading, type CameraProjection, type CameraSettings, type CameraTransitionResult } from '@opsorama/core';
import type { CameraPathPlayback, SceneRenderer } from '@opsorama/three';
import { cameraSnippet, cameraStops, cameraTour, followTarget, type CameraSession } from '../../../examples/cameras-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;
const toDegrees = (radians: number) => Math.round(radians * 180 / Math.PI), toRadians = (degrees: number) => degrees * Math.PI / 180;

/**
 * Live camera example: projection, direction, field of view and orbit controls in `SceneSettings.camera`, and timed moves
 * to nodes and back to the overview, following a route-driven node and a camera path through the renderer's camera API. The same scene runs through native React, Vue and plain JavaScript;
 * each renders the readout over its scene from the camera view (`useCameraView` or `onCameraChange`).
 */
export function CameraExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [touch, setTouch] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [seconds, setSeconds] = useState(1.2), [easing, setEasing] = useState<CameraEasing>(DEFAULT_CAMERA_TRANSITION.easing), [moves, setMoves] = useState<string[]>([]);
  const [following, setFollowing] = useState<CameraFollowHeading | null>(null), [tour, setTour] = useState<CameraPathPlayback | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<CameraSession | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef(camera); latest.current = camera;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: CameraSession | null = null;
    setError(null); setMoves([]); setLoaded(false); setFollowing(null); setTour(null);
    // Moves wait for the first frame: before it, every camera move is a cut.
    const ready = (value: SceneRenderer) => { if (!active) return; renderer.current = value; void value.loaded.then(() => { if (active) setLoaded(true); }, () => undefined); };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/cameras-react')).mountCamerasReact : adapter === 'Vue' ? (await import('../../../examples/cameras-vue')).mountCamerasVue : (await import('../../../examples/cameras-javascript')).mountCamerasJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, ready, touch); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; renderer.current = null; };
    // Touch gestures are a mount-time option: switching them remounts the scene, like an adapter's touchGestures prop.
  }, [adapter, mounted, touch]);
  const signature = JSON.stringify(camera);
  useEffect(() => { session.current?.store.configure({ camera: JSON.parse(signature) as CameraSettings }); }, [signature]);
  const change = (patch: Partial<CameraSettings>) => setCamera(current => ({ ...current, ...patch }));
  const transition = { seconds, easing };
  /** Logs how a move ended, unless the scene was remounted since it started. */
  const log = (label: string) => { const owner = renderer.current; return (result: string) => { if (renderer.current === owner) setMoves(current => [`${label}: ${result}`, ...current].slice(0, 4)); }; };
  const follow = (heading: CameraFollowHeading) => {
    const owner = renderer.current; if (!owner) return;
    setFollowing(heading);
    // The promise settles when following ends: stopped, interrupted (a pan or another move) or removed.
    void owner.followNode(followTarget.id, { heading }).then(end => { if (renderer.current === owner && owner.getFollowedNode() === null) setFollowing(null); log('Follow')(end); });
  };
  const playTour = () => {
    const playback = renderer.current?.playCameraPath(cameraTour); if (!playback) return;
    setFollowing(null); setTour(playback);
    void playback.finished.then((result: CameraTransitionResult) => { setTour(current => current === playback ? null : current); log('Tour')(result); });
  };
  return <section className="adapter-example camera-example" aria-label="Camera example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="camera-example-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <label>Projection<select aria-label="Camera projection" value={camera.projection} onChange={event => change({ projection: event.target.value as CameraProjection })}>{CAMERA_PROJECTIONS.map(option => <option key={option}>{option}</option>)}</select></label>
      <label>Yaw <span>{toDegrees(camera.yaw)}°</span><input aria-label="Camera yaw" type="range" min={-180} max={180} step={1} value={toDegrees(camera.yaw)} onChange={event => change({ yaw: toRadians(Number(event.target.value)) })} /></label>
      <label>Pitch <span>{toDegrees(camera.pitch)}°</span><input aria-label="Camera pitch" type="range" min={3} max={88} step={1} value={toDegrees(camera.pitch)} onChange={event => change({ pitch: toRadians(Number(event.target.value)) })} /></label>
      <label><input type="checkbox" aria-label="Orbit controls" checked={camera.controls === 'orbit'} onChange={event => change({ controls: event.target.checked ? 'orbit' : 'pan' })} />Orbit</label>
      <label>Field of view <span>{camera.fov}°</span><input aria-label="Camera field of view" type="range" min={CAMERA_FOV_RANGE.min} max={CAMERA_FOV_RANGE.max} step={1} value={camera.fov} disabled={camera.projection !== 'perspective'} onChange={event => change({ fov: Number(event.target.value) })} /></label>
      <label><input type="checkbox" aria-label="Touch gestures" checked={touch} onChange={event => setTouch(event.target.checked)} />Touch gestures</label>
      <button type="button" onClick={() => setCamera(DEFAULT_CAMERA_SETTINGS)}>Reset camera</button>
    </div>
    <div className="indicator-controls">
      <label>Transition <span>{seconds.toFixed(1)} s</span><input aria-label="Transition seconds" type="range" min={0} max={3} step={.1} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /></label>
      <label>Easing<select aria-label="Transition easing" value={easing} onChange={event => setEasing(event.target.value as CameraEasing)}>{CAMERA_EASINGS.map(option => <option key={option}>{option}</option>)}</select></label>
      {cameraStops.map(stop => <button key={stop.id} type="button" disabled={!mounted || !loaded} onClick={() => { void renderer.current?.frame(stop.id, { fit: true, transition }).then(log(stop.label)); }}>Go to {stop.label}</button>)}
      <button type="button" disabled={!mounted || !loaded} onClick={() => { void renderer.current?.overview({ transition }).then(log('Overview')); }}>Overview</button>
    </div>
    <div className="indicator-controls">
      <button type="button" disabled={!mounted || !loaded} onClick={() => follow('fixed')}>Follow {followTarget.label}</button>
      <button type="button" disabled={!mounted || !loaded} onClick={() => follow('behind')}>Follow from behind</button>
      <button type="button" disabled={!following} onClick={() => { void renderer.current?.followNode(null); }}>Stop following</button>
      <button type="button" disabled={!mounted || !loaded} onClick={playTour}>Play tour</button>
      <button type="button" disabled={!tour} onClick={() => tour?.stop()}>Stop tour</button>
      <output className="camera-follow-status">{following ? `Following ${followTarget.label}${following === 'behind' ? ' from behind' : ''}` : tour ? 'Playing tour' : 'Camera free'}</output>
    </div>
    <ol className="camera-moves" aria-label="Camera moves">{moves.map((move, index) => <li key={`${index}-${move}`}>{move}</li>)}</ol>
    <p className="camera-example-hint">Drag to pan and use the wheel to zoom. With Orbit on, drag with the right button or with Ctrl held to turn the view around its centre. Touch scrolls the page until Touch gestures is on (it remounts the scene): then one finger pans, two fingers pinch to zoom, and with Orbit on twisting two fingers or dragging them up or down turns the view. A drag, another move or a zoom change interrupts a running move or tour; a pan ends following, an orbit keeps it. With reduced motion every move is a cut and the tour cuts from keyframe to keyframe.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={cameraSnippet(camera, transition, frameworks[adapter], touch)} language={adapter === 'JavaScript' ? 'typescript' : adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
