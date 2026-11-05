'use client';
import { useEffect, useRef, useState } from 'react';
import { type AssetNode, formatMeasurement } from '@opsorama/core';
import { assetMeasurementDefinitions, type SceneRenderer } from '@opsorama/renderer-three';

export function IndicatorExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [asset, setAsset] = useState('ring-gauge'), [variant, setVariant] = useState('full'), [value, setValue] = useState(72.5), [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<{ update(node: AssetNode): void; dispose(): void } | null>(null);
  const node: AssetNode = { id: 'reading', kind: 'asset', asset, variant, selectable: true, scale: [3, 3, 3], measurement: { value: unknown ? null : value, unit: '%', target: 80, bands: [{ from: 0, to: 70, state: 'normal' }, { from: 70, to: 90, state: 'warning' }, { from: 90, to: 100, state: 'critical' }] } };
  const latest = useRef(node); latest.current = node;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: typeof session.current = null;
    setError(null);
    const ready = (renderer: SceneRenderer) => { if (active) renderer.overview(); };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/indicator-react')).mountIndicatorReact : adapter === 'Vue' ? (await import('../../../examples/indicator-vue')).mountIndicatorVue : (await import('../../../examples/indicator-javascript')).mountIndicatorJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, ready); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.update(latest.current); }, [asset, variant, value, unknown]);
  return <section className="adapter-example indicator-example" aria-label="Measured indicators">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(v => !v)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface">{mounted ? <div key={adapter} ref={container} style={{ height: 380, position: 'relative' }} /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls"><label>Indicator<select aria-label="Indicator model" value={asset} onChange={event => { setAsset(event.target.value); setVariant(assetMeasurementDefinitions[event.target.value].variants[0]); }}>{Object.keys(assetMeasurementDefinitions).map(key => <option key={key}>{key}</option>)}</select></label><label>Variant<select aria-label="Indicator variant" value={variant} onChange={event => setVariant(event.target.value)}>{assetMeasurementDefinitions[asset].variants.map(key => <option key={key}>{key}</option>)}</select></label><label>Value<input aria-label="Indicator value" aria-valuetext={formatMeasurement(node.measurement!)} type="range" min={0} max={100} step={1} value={value} disabled={unknown} onChange={event => setValue(event.target.valueAsNumber)} /></label><label>Unknown<input aria-label="Indicator unknown" type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} /></label></div>
    <p role="status">{formatMeasurement(node.measurement!)}</p>{error && <p role="alert">{error}</p>}
  </section>;
}
