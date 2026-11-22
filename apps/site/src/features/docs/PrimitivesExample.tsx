'use client';
import { useEffect, useRef, useState } from 'react';
import type { Selection } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { chartValues, primitivesSnippet, selectionSummary, valuesSummary, type PrimitivesCallbacks, type PrimitivesSession } from '../../../examples/primitives-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;

/**
 * Live primitives example: a 3D bar chart of shape, line and group nodes driven by data, and a shuttle group on a route.
 * "New data" shows another data set; a click on a bar selects its series group (selection bubbles through groups). The
 * same scene runs through native React, Vue and plain JavaScript, and the readout shows how many equal shapes draw as
 * instanced batches.
 */
export function PrimitivesExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [dataSet, setDataSet] = useState(0), [selection, setSelection] = useState<Selection | null>(null), [loaded, setLoaded] = useState(false);
  const [instancing, setInstancing] = useState<{ batches: number; instances: number } | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<PrimitivesSession | null>(null);
  const values = chartValues(dataSet), latest = useRef(values); latest.current = values;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: PrimitivesSession | null = null, renderer: SceneRenderer | null = null;
    setError(null); setLoaded(false); setSelection(null); setInstancing(null);
    const callbacks: PrimitivesCallbacks = {
      ready: value => { if (!active) return; renderer = value; void value.loaded.then(() => { if (active) setLoaded(true); }); },
      select: value => { if (active) setSelection(value); },
    };
    // Instancing changes when shapes rebuild; reading the diagnostics once a second is cheap.
    const timer = setInterval(() => { const diagnostics = renderer?.getDiagnostics(); if (active && diagnostics?.loaded) setInstancing({ batches: diagnostics.instanceBatches, instances: diagnostics.instances }); }, 1000);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/primitives-react')).mountPrimitivesReact : adapter === 'Vue' ? (await import('../../../examples/primitives-vue')).mountPrimitivesVue : (await import('../../../examples/primitives-javascript')).mountPrimitivesJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, {}, latest.current, callbacks); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; clearInterval(timer); view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.setValues(chartValues(dataSet)); }, [dataSet]);
  return <section className="adapter-example primitives-example" aria-label="Primitives example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="primitives-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <button type="button" onClick={() => setDataSet(value => value + 1)}>New data</button>
      <output className="primitives-values" aria-label="Series totals">{`Data set ${dataSet + 1}: ${valuesSummary(values)}`}</output>
      <output className="primitives-selection" aria-label="Selection">{selectionSummary(selection)}</output>
      <output className="primitives-instancing" aria-label="Instancing">{instancing ? `Instanced: ${instancing.batches} batches · ${instancing.instances} shapes` : 'Instanced: measuring'}</output>
      <output className="primitives-load-status">{mounted ? loaded ? 'Scene loaded' : 'Loading scene' : 'Scene unmounted'}</output>
    </div>
    <p className="primitives-hint">Each bar is a box shape in its series group; a click on a bar or trend line selects the series, because a click on a node that is not selectable bubbles to its nearest selectable group. The shuttle is a group with a route: its body, cab, wheels and beacon are shapes that move with it. Bars of every size and color share one unit box, so they draw as one instanced batch; the translucent target band is never instanced. New data updates only the bars, trend lines and peak marker that changed.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={primitivesSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
