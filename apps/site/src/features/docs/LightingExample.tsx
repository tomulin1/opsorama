'use client';
import { useEffect, useRef, useState } from 'react';
import { LIGHTING_PRESETS, QUALITY_LEVELS, type Selection } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { DEFAULT_LIGHTING_DATA, lightingSnippet, selectionSummary, type LightingCallbacks, type LightingData, type LightingSession } from '../../../examples/lighting-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;

/**
 * Live lighting example: one delivery yard through native React, Vue and plain JavaScript under each lighting preset,
 * with the sky, fog, quality, theme and camera settings. The readouts show the canvas pixel ratio that the quality
 * profile allows and how many models were built, which a lighting change never repeats.
 */
export function LightingExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LightingData>(DEFAULT_LIGHTING_DATA), [selection, setSelection] = useState<Selection | null>(null), [loaded, setLoaded] = useState(false);
  const [readout, setReadout] = useState<{ ratio: number; builds: number } | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<LightingSession | null>(null), latest = useRef(data); latest.current = data;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: LightingSession | null = null, renderer: SceneRenderer | null = null;
    setError(null); setLoaded(false); setSelection(null); setReadout(null);
    const callbacks: LightingCallbacks = {
      ready: value => { if (!active) return; renderer = value; void value.loaded.then(() => { if (active) setLoaded(true); }, () => undefined); },
      select: value => { if (active) setSelection(value); },
      error: failure => { if (active) setError(failure.message); },
    };
    // The canvas pixel ratio is its drawing buffer width over its CSS width.
    const timer = setInterval(() => {
      const canvas = container.current?.querySelector('canvas'), diagnostics = renderer?.getDiagnostics();
      if (active && canvas && canvas.clientWidth && diagnostics?.loaded) setReadout({ ratio: Math.round(canvas.width / canvas.clientWidth * 100) / 100, builds: diagnostics.work.nodeBuilds });
    }, 500);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/lighting-react')).mountLightingReact : adapter === 'Vue' ? (await import('../../../examples/lighting-vue')).mountLightingVue : (await import('../../../examples/lighting-javascript')).mountLightingJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, callbacks); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; clearInterval(timer); view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.setData(data); }, [data]);
  const set = (patch: Partial<LightingData>) => setData(current => ({ ...current, ...patch }));
  return <section className="adapter-example lighting-example" aria-label="Lighting example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount' : 'Mount'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="lighting-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <label>Lighting <select aria-label="Lighting preset" value={data.lighting} onChange={event => set({ lighting: event.target.value as LightingData['lighting'] })}>{LIGHTING_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}</select></label>
      <label>Quality <select aria-label="Quality" value={data.quality} onChange={event => set({ quality: event.target.value as LightingData['quality'] })}>{QUALITY_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select></label>
      <button type="button" aria-pressed={data.sky} onClick={() => set({ sky: !data.sky })}>Sky</button>
      <button type="button" aria-pressed={data.fog} onClick={() => set({ fog: !data.fog })}>Fog</button>
      <button type="button" aria-pressed={data.perspective} onClick={() => set({ perspective: !data.perspective })}>Perspective</button>
      <button type="button" aria-pressed={data.theme === 'midnight'} onClick={() => set({ theme: data.theme === 'light' ? 'midnight' : 'light' })}>{`Theme: ${data.theme}`}</button>
      <output className="lighting-status" aria-label="Load status">{mounted ? loaded ? 'Scene loaded' : 'Loading scene' : 'Scene unmounted'}</output>
      <output className="lighting-ratio" aria-label="Pixel ratio">{readout ? `Pixel ratio: ${readout.ratio}` : 'Pixel ratio: measuring'}</output>
      <output className="lighting-builds" aria-label="Model builds">{readout ? `Model builds: ${readout.builds}` : 'Model builds: measuring'}</output>
      <output className="lighting-selection" aria-label="Selection">{selectionSummary(selection)}</output>
    </div>
    <p className="lighting-hint">Lighting presets change the ambient and sun light, the exposure, the background and the sky and fog colors, with a variant for each theme. The models are not rebuilt, so the model build count stays the same. The sky draws a gradient behind the scene, and the fog fades the far side of the yard into the horizon. Quality caps the canvas pixel ratio (2, 1.5, 1) and the shadow map (2048, 1024, 512 px) for large scenes and weak devices.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={lightingSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
