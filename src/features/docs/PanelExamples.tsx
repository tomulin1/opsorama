'use client';
import { useEffect, useRef, useState } from 'react';
import { initialPanelSample, type PanelSample } from '../../../examples/panels-fixture';
import '@opsorama/ui/styles.css';
import './panels.css';

export function PanelExamples() {
  const [adapter, setAdapter] = useState('React'), [mounted, setMounted] = useState(true), [sample, setSample] = useState(initialPanelSample), [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null), session = useRef<{ update(value: PanelSample): void; dispose(): void } | null>(null);
  const latest = useRef(sample); latest.current = sample;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: typeof session.current = null; setError('');
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/panels-react')).mountPanelsReact : adapter === 'Vue' ? (await import('../../../examples/panels-vue')).mountPanelsVue : (await import('../../../examples/panels-javascript')).mountPanelsJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current, id => setSample(value => ({ ...value, selectedId: id })), zoom => setSample(value => ({ ...value, zoom }))); session.current = view;
    })().catch(failure => { if (active) setError(String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => session.current?.update(sample), [sample]);
  return <section className="panel-examples" aria-label="Generic panel samples">
    <div className="panel-sample-controls">{['React', 'Vue', 'JavaScript'].map(name => <button type="button" key={name} aria-pressed={adapter === name} onClick={() => setAdapter(name)}>{name}</button>)}<button type="button" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount panels' : 'Mount panels'}</button></div>
    <div className="panel-sample-controls"><label>Sample reading<input aria-label="Sample reading" type="number" value={sample.value ?? ''} onChange={event => setSample(value => ({ ...value, value: event.target.value === '' ? null : Number(event.target.value) }))} /></label><label>Content state<select value={sample.state} onChange={event => setSample(value => ({ ...value, state: event.target.value as PanelSample['state'] }))}>{['ready', 'loading', 'empty', 'error'].map(value => <option key={value}>{value}</option>)}</select></label></div>
    <label><input type="checkbox" checked={sample.reverseRows ?? false} onChange={event => setSample(value => ({ ...value, reverseRows: event.target.checked }))} /> Reverse sample rows</label>
    <p role="status">Selected sample: {sample.selectedId ?? 'none'}</p>
    {error && <p role="alert">{error}</p>}
    <div key={`${adapter}-${mounted}`} ref={container} />
  </section>;
}
