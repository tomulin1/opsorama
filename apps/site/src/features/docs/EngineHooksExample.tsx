'use client';
import { useEffect, useRef, useState } from 'react';
import type { SceneSettings } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { engineHooksSnippet, type EngineHooksCallbacks, type EngineHooksSession } from '../../../examples/engine-hooks-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;
const SPEEDS = [.5, 1, 2, 3] as const;

/**
 * Live engine hooks example: a click on the floor sends a robot there through `onPointer` (and keeps the selection with
 * `preventSelection`), a renderer plugin draws a ring on the destination, and a fixed-step frame listener counts steps.
 * The same scene runs through native React, Vue and plain JavaScript; pause, speed and motion show how the frame hook
 * follows the scene settings, and unmounting shows the plugin cleanup.
 */
export function EngineHooksExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Pick<SceneSettings, 'paused' | 'speed' | 'motion'>>({ paused: false, speed: 1, motion: true });
  const [lifecycle, setLifecycle] = useState({ setups: 0, cleanups: 0 }), [loaded, setLoaded] = useState(false);
  const container = useRef<HTMLDivElement>(null), session = useRef<EngineHooksSession | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef(settings); latest.current = settings;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: EngineHooksSession | null = null;
    setError(null); setLoaded(false);
    // Lifecycle reports keep arriving after the effect ends: the cleanup of the plugin runs when the scene is disposed.
    const callbacks: EngineHooksCallbacks = {
      ready: value => { if (!active) return; renderer.current = value; void value.loaded.then(() => { if (active) setLoaded(true); }, () => undefined); },
      lifecycle: event => setLifecycle(current => event === 'setup' ? { ...current, setups: current.setups + 1 } : { ...current, cleanups: current.cleanups + 1 }),
    };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/engine-hooks-react')).mountEngineHooksReact : adapter === 'Vue' ? (await import('../../../examples/engine-hooks-vue')).mountEngineHooksVue : (await import('../../../examples/engine-hooks-javascript')).mountEngineHooksJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, callbacks); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  const signature = JSON.stringify(settings);
  useEffect(() => { session.current?.store.configure(JSON.parse(signature) as Partial<SceneSettings>); }, [signature]);
  return <section className="adapter-example engine-hooks-example" aria-label="Engine hooks example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="engine-hooks-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <label><input type="checkbox" aria-label="Pause scene" checked={settings.paused} onChange={event => setSettings(current => ({ ...current, paused: event.target.checked }))} />Pause</label>
      <label>Speed<select aria-label="Scene speed" value={settings.speed} onChange={event => setSettings(current => ({ ...current, speed: Number(event.target.value) }))}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
      <label><input type="checkbox" aria-label="Scene motion" checked={settings.motion} onChange={event => setSettings(current => ({ ...current, motion: event.target.checked }))} />Motion</label>
      <output className="engine-plugin-status" aria-label="Plugin lifecycle">{`Plugin setups: ${lifecycle.setups} · cleanups: ${lifecycle.cleanups}`}</output>
      <output className="engine-load-status">{mounted ? loaded ? 'Scene loaded' : 'Loading scene' : 'Scene unmounted'}</output>
    </div>
    <p className="engine-hooks-hint">Click the floor to send the robot there: the click handler calls <code>preventSelection()</code>, so the selection and the camera stay. Click the robot, the rack or a label to select it as usual. The ring is a renderer plugin; the step counter is a fixed-step frame listener that stops while paused, follows the speed and keeps counting with motion off. Unmounting the scene runs the plugin cleanup.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={engineHooksSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
