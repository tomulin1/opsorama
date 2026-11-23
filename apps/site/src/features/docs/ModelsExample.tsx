'use client';
import { useEffect, useRef, useState } from 'react';
import type { Selection } from '@opsorama/core';
import { assetLoadsSettled, type SceneRenderer } from '@opsorama/three';
import { modelsSnippet, selectionSummary, type ModelsCallbacks, type ModelsData, type ModelsSession } from '../../../examples/models-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;
type Diagnostics = { batches: number; instances: number; geometries: number; textures: number };

/**
 * Live glTF example: delivery drones from one GLB file next to catalog models, through native React, Vue and plain
 * JavaScript. "Parked drones" changes how many stand on the pad, "Theme" rebuilds every model from the cached file, and
 * remounting releases the file and loads it again. The readouts show the instanced batches, the GPU geometries and
 * textures, and when the model file has loaded.
 */
export function ModelsExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(4), [theme, setTheme] = useState<ModelsData['theme']>('light'), [selection, setSelection] = useState<Selection | null>(null);
  const [status, setStatus] = useState<'loading' | 'scene' | 'models'>('loading'), [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<ModelsSession | null>(null);
  const data: ModelsData = { count, theme }, latest = useRef(data); latest.current = data;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: ModelsSession | null = null, renderer: SceneRenderer | null = null;
    setError(null); setStatus('loading'); setSelection(null); setDiagnostics(null);
    const callbacks: ModelsCallbacks = {
      // The scene is drawn first with placeholder boxes; the drones replace them once the file has loaded.
      ready: value => { if (!active) return; renderer = value; void value.loaded.then(() => { if (active) setStatus('scene'); return assetLoadsSettled(); }).then(() => { if (active) setStatus('models'); }, () => undefined); },
      select: value => { if (active) setSelection(value); },
      error: failure => { if (active) setError(failure.message); },
    };
    const timer = setInterval(() => { const current = renderer?.getDiagnostics(); if (active && current?.loaded) setDiagnostics({ batches: current.instanceBatches, instances: current.instances, geometries: current.geometries, textures: current.textures }); }, 1000);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/models-react')).mountModelsReact : adapter === 'Vue' ? (await import('../../../examples/models-vue')).mountModelsVue : (await import('../../../examples/models-javascript')).mountModelsJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, {}, latest.current, callbacks); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; clearInterval(timer); view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.setData({ count, theme }); }, [count, theme]);
  return <section className="adapter-example models-example" aria-label="glTF models example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount' : 'Mount'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="models-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <button type="button" aria-pressed={count > 4} onClick={() => setCount(value => value > 4 ? 4 : 12)}>{`Parked drones: ${count}`}</button>
      <button type="button" aria-pressed={theme === 'midnight'} onClick={() => setTheme(value => value === 'light' ? 'midnight' : 'light')}>{`Theme: ${theme}`}</button>
      <output className="models-status" aria-label="Load status">{!mounted ? 'Scene unmounted' : status === 'models' ? 'Models loaded' : status === 'scene' ? 'Loading models' : 'Loading scene'}</output>
      <output className="models-selection" aria-label="Selection">{selectionSummary(selection)}</output>
      <output className="models-instancing" aria-label="Instancing">{diagnostics ? `Instanced: ${diagnostics.batches} batches · ${diagnostics.instances} meshes` : 'Instanced: measuring'}</output>
      <output className="models-memory" aria-label="GPU resources">{diagnostics ? `Geometries: ${diagnostics.geometries} · Textures: ${diagnostics.textures}` : 'Geometries: measuring'}</output>
    </div>
    <p className="models-hint">Every drone comes from one GLB file, loaded once: the drones share its geometry, materials and texture, and the renderer draws their repeated parts as instanced batches, so twelve parked drones cost about as many draw calls as four. Until the file has loaded each drone is a translucent box. The flying drones play the file&apos;s rotor animation while scene motion is on. A theme change rebuilds every model from the cached file; unmounting releases the file.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={modelsSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
