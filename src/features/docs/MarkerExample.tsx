'use client';
import { useEffect, useRef, useState } from 'react';
import { MARKER_ICONS, MARKER_SHAPES, MARKER_SIZES, MARKER_TONES, validateNode, type MarkerIconName, type MarkerNode, type MarkerShape, type MarkerSize, type MarkerTone } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { defaultFeaturedMarker, markerSnippet } from '../../../examples/marker-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
interface Session { update(marker: MarkerNode): void; dispose(): void; }
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;

function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: readonly V[]; onChange(value: V): void }) {
  return <label>{label}<select aria-label={`Marker ${label.toLowerCase()}`} value={value} onChange={event => onChange(event.target.value as V)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}
function Text({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label>{label}<input aria-label={`Marker ${label.toLowerCase()}`} value={value} onChange={event => onChange(event.target.value)} /></label>;
}

/** Live marker configurator. The same marker runs through native React, Vue and plain JavaScript; the gallery row shows every shape. */
export function MarkerExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<MarkerShape>('pin'), [tone, setTone] = useState<MarkerTone>('critical'), [icon, setIcon] = useState<MarkerIconName>('thermometer');
  const [markerSize, setMarkerSize] = useState<MarkerSize>('medium'), [pulse, setPulse] = useState<'auto' | 'on' | 'off'>('auto'), [color, setColor] = useState('');
  const [eyebrow, setEyebrow] = useState(defaultFeaturedMarker.eyebrow!), [label, setLabel] = useState(defaultFeaturedMarker.label), [detail, setDetail] = useState(defaultFeaturedMarker.detail!);
  const marker: MarkerNode = {
    ...defaultFeaturedMarker, shape, tone, icon, label, ...(markerSize !== 'medium' ? { markerSize } : {}), ...(pulse !== 'auto' ? { pulse: pulse === 'on' } : {}), ...(color ? { color } : {}),
    eyebrow: eyebrow || undefined, detail: detail || undefined,
  };
  // Validate with core so an invalid draft keeps the last valid preview and names the fix.
  let invalid = '';
  try { validateNode(marker); } catch (failure) { invalid = failure instanceof Error ? failure.message : String(failure); }
  const latest = useRef(marker); if (!invalid) latest.current = marker;
  const container = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: Session | null = null;
    setError(null);
    const ready = (renderer: SceneRenderer) => { if (active) renderer.overview(); };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/marker-react')).mountMarkerReact : adapter === 'Vue' ? (await import('../../../examples/marker-vue')).mountMarkerVue : (await import('../../../examples/marker-javascript')).mountMarkerJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, ready); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  const signature = JSON.stringify(latest.current);
  useEffect(() => { session.current?.update(JSON.parse(signature) as MarkerNode); }, [signature]);
  return <section className="adapter-example marker-example" aria-label="Scene marker configurator">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface">{mounted ? <div key={adapter} ref={container} style={{ height: 380, position: 'relative' }} /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="indicator-controls">
      <Choice<MarkerShape> label="Shape" value={shape} options={MARKER_SHAPES} onChange={setShape} />
      <Choice<MarkerTone> label="Tone" value={tone} options={MARKER_TONES} onChange={setTone} />
      <Choice<MarkerIconName> label="Icon" value={icon} options={MARKER_ICONS} onChange={setIcon} />
      <Choice<MarkerSize> label="Size" value={markerSize} options={Object.keys(MARKER_SIZES) as MarkerSize[]} onChange={setMarkerSize} />
      <Choice<'auto' | 'on' | 'off'> label="Pulse" value={pulse} options={['auto', 'on', 'off'] as const} onChange={setPulse} />
      <label>Colour<input aria-label="Marker colour" type="color" value={color || '#d9483b'} onChange={event => setColor(event.target.value)} /><button type="button" onClick={() => setColor('')} disabled={!color}>Tone colour</button></label>
      <Text label="Eyebrow" value={eyebrow} onChange={setEyebrow} />
      <Text label="Label" value={label} onChange={setLabel} />
      <Text label="Detail" value={detail} onChange={setDetail} />
    </div>
    <p className="marker-example-hint">Hover or focus a marker to open its card; select one to keep it open. The row in front shows every shape.</p>
    {invalid && <p role="alert">{invalid}</p>}{error && <p role="alert">{error}</p>}
    <CodeBlock code={markerSnippet(latest.current, frameworks[adapter])} language={adapter === 'JavaScript' ? 'typescript' : adapter === 'React' ? 'tsx' : 'vue'} />
  </section>;
}
