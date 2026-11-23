'use client';
import { useEffect, useRef, useState } from 'react';
import type { Selection } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { chartValues, primitivesSnippet, selectionSummary, valuesSummary, type ChartData, type PrimitivesCallbacks, type PrimitivesSession } from '../../../examples/primitives-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;
type Diagnostics = { batches: number; instances: number; textures: number };

/**
 * Live primitives example: a 3D bar chart of shape, line, text and group nodes driven by data, an image node, and a
 * shuttle group on a route. "New data" shows another data set and "Value labels" adds or removes the billboard text over
 * the bars; a click on a bar or a value selects its series group (selection bubbles through groups). The same scene runs
 * through native React, Vue and plain JavaScript; the readouts show the instanced batches and the GPU textures, which
 * return to their earlier count when text nodes are removed.
 */
export function PrimitivesExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [dataSet, setDataSet] = useState(0), [labels, setLabels] = useState(true), [selection, setSelection] = useState<Selection | null>(null), [loaded, setLoaded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<PrimitivesSession | null>(null);
  const values = chartValues(dataSet), data: ChartData = { values, labels }, latest = useRef(data); latest.current = data;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: PrimitivesSession | null = null, renderer: SceneRenderer | null = null;
    setError(null); setLoaded(false); setSelection(null); setDiagnostics(null);
    const callbacks: PrimitivesCallbacks = {
      ready: value => { if (!active) return; renderer = value; void value.loaded.then(() => { if (active) setLoaded(true); }, () => undefined); },
      select: value => { if (active) setSelection(value); },
      error: failure => { if (active) setError(failure.message); },
    };
    // Instancing and textures change when nodes rebuild; reading the diagnostics once a second is cheap.
    const timer = setInterval(() => { const current = renderer?.getDiagnostics(); if (active && current?.loaded) setDiagnostics({ batches: current.instanceBatches, instances: current.instances, textures: current.textures }); }, 1000);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/primitives-react')).mountPrimitivesReact : adapter === 'Vue' ? (await import('../../../examples/primitives-vue')).mountPrimitivesVue : (await import('../../../examples/primitives-javascript')).mountPrimitivesJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, {}, latest.current, callbacks); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; clearInterval(timer); view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.setData({ values: chartValues(dataSet), labels }); }, [dataSet, labels]);
  return <section className="adapter-example primitives-example" aria-label="Primitives example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="primitives-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <button type="button" onClick={() => setDataSet(value => value + 1)}>New data</button>
      <button type="button" aria-pressed={labels} onClick={() => setLabels(value => !value)}>Value labels</button>
      <output className="primitives-values" aria-label="Series totals">{`Data set ${dataSet + 1}: ${valuesSummary(values)}`}</output>
      <output className="primitives-selection" aria-label="Selection">{selectionSummary(selection)}</output>
      <output className="primitives-instancing" aria-label="Instancing">{diagnostics ? `Instanced: ${diagnostics.batches} batches · ${diagnostics.instances} shapes` : 'Instanced: measuring'}</output>
      <output className="primitives-textures" aria-label="Textures">{diagnostics ? `Textures: ${diagnostics.textures}` : 'Textures: measuring'}</output>
      <output className="primitives-load-status">{mounted ? loaded ? 'Scene loaded' : 'Loading scene' : 'Scene unmounted'}</output>
    </div>
    <p className="primitives-hint">Each bar is a box shape in its series group; a click on a bar, its value or its trend line selects the series, because a click on a node that is not selectable bubbles to its nearest selectable group. The values over the bars are billboard text nodes that face the camera; the title and months lie flat on the floor; the mark beside the chart is an image node you can select. Text is drawn into textures that equal labels share, so the texture count drops when you turn the value labels off and returns when you turn them on. Text drawn in the canvas is not accessible text, so the series totals are also stated in HTML above. The shuttle is a group with a route: its body, cab, wheels and beacon are shapes that move with it. Bars of every size and color share one unit box, so they draw as one instanced batch; the translucent target band, text and images are never instanced.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={primitivesSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}
