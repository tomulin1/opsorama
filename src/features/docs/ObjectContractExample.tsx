'use client';
import { useEffect, useRef, useState } from 'react';
import type { SceneNode, SceneStore, VisualState } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { CONTRACT_PALETTES, DEFAULT_CONTRACT, contractNodes, type ContractPalette, type ContractSettings } from '../../../examples/object-contract-data';

type Session = { update(nodes: readonly SceneNode[]): void; store: SceneStore; dispose(): void };
type Adapter = 'React' | 'Vue' | 'JavaScript';
const STATES: readonly VisualState[] = ['normal', 'busy', 'warning', 'critical', 'inactive'];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** One parcel definition through three adapters: palettes, overrides, state, selection, motion gates and resource cleanup. */
export function ObjectContractExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mountKey, setMountKey] = useState(0);
  const [settings, setSettings] = useState<ContractSettings>(DEFAULT_CONTRACT);
  const [motion, setMotion] = useState(true), [paused, setPaused] = useState(false);
  const [readout, setReadout] = useState({ x: '—', selection: 'none', geometries: 0, objects: 0, textures: 0 });
  const [baseline, setBaseline] = useState<number | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef(settings); latest.current = settings;
  const scene = useRef({ motion, paused, palette: settings.palette }); scene.current = { motion, paused, palette: settings.palette };
  const configure = (store: SceneStore) => store.configure({ motion: scene.current.motion, paused: scene.current.paused, palette: CONTRACT_PALETTES[scene.current.palette] });

  useEffect(() => {
    let active = true, view: Session | null = null;
    setError(null);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/object-contract-react')).mountContractReact : adapter === 'Vue' ? (await import('../../../examples/object-contract-vue')).mountContractVue : (await import('../../../examples/object-contract-javascript')).mountContractJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, contractNodes(latest.current), value => { if (active) { renderer.current = value; value.overview(); } });
      configure(view.store); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mountKey]);
  useEffect(() => { session.current?.update(contractNodes(settings)); }, [settings]);
  useEffect(() => { if (session.current) configure(session.current.store); }, [motion, paused, settings.palette]);
  // Rendered pose and resources, read from the renderer rather than the record.
  useEffect(() => {
    const timer = setInterval(() => {
      const view = renderer.current, anchor = view?.getAnchor('parcel-main', 'front'), metrics = view?.getDiagnostics();
      setReadout({ x: anchor ? anchor.position[0].toFixed(2) : '—', selection: session.current?.store.getSnapshot().selection?.nodeId ?? 'none', geometries: metrics?.geometries ?? 0, objects: metrics?.objects ?? 0, textures: metrics?.textures ?? 0 });
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const set = (patch: Partial<ContractSettings>) => setSettings(value => ({ ...value, ...patch }));
  /** Rebuild the parcel through many configurations and back; geometry counts must return to where they started. */
  const cycle = async () => {
    setBusy('Cycling updates…'); setBaseline(null);
    const start = renderer.current?.getDiagnostics().geometries ?? 0, original = latest.current;
    for (let i = 0; i < 20; i++) { set({ variant: i % 2 ? 'open' : 'closed', state: STATES[i % STATES.length], override: i % 2 === 0, legacyColor: i % 4 === 0 }); await pause(40); }
    setSettings(original); await pause(400);
    setBaseline(start); setBusy('');
  };
  const remount = async () => { setBusy('Remounting…'); for (let i = 0; i < 5; i++) { setMountKey(key => key + 1); await pause(250); } setBusy(''); };

  return <section className="adapter-example contract-example" aria-label="Object contract">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => setAdapter(name)}>{name}</button>)}</div>
    <div className="adapter-example-surface"><div key={`${adapter}-${mountKey}`} ref={container} style={{ height: 380, position: 'relative' }} /></div>
    <div className="motion-controls">
      <label>Scene palette<select aria-label="Scene palette" value={settings.palette} onChange={event => set({ palette: event.target.value as ContractPalette })}>{Object.keys(CONTRACT_PALETTES).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label><input type="checkbox" checked={settings.override} onChange={event => set({ override: event.target.checked })} />Instance trim and sticker</label>
      <label><input type="checkbox" checked={settings.legacyColor} onChange={event => set({ legacyColor: event.target.checked })} />Legacy color</label>
      <label>Variant<select aria-label="Variant" value={settings.variant} onChange={event => set({ variant: event.target.value as 'closed' | 'open' })}><option>closed</option><option>open</option></select></label>
    </div>
    <div className="motion-controls">
      <button onClick={() => set({ spot: settings.spot ? 0 : 1 })}>Move parcel</button>
      <button onClick={() => session.current?.store.select('parcel-main')}>Select parcel</button>
      <button onClick={() => session.current?.store.select(null)}>Clear selection</button>
      <label><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} />Motion</label>
      <label><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} />Pause</label>
      <button disabled={Boolean(busy)} onClick={() => void cycle()}>Cycle 20 updates</button>
      <button disabled={Boolean(busy)} onClick={() => void remount()}>Remount 5 times</button>
      {busy && <span role="status">{busy}</span>}
    </div>
    <dl className="contract-readout">
      <div><dt>Rendered x</dt><dd><output aria-label="Rendered x">{readout.x}</output></dd></div>
      <div><dt>Selection</dt><dd><output aria-label="Selection">{readout.selection}</output></dd></div>
      <div><dt>Geometries</dt><dd><output aria-label="Geometries">{readout.geometries}</output></dd></div>
      <div><dt>Before the update cycle</dt><dd><output aria-label="Geometries before cycle">{baseline ?? '—'}</output></dd></div>
      <div><dt>Objects</dt><dd><output aria-label="Objects">{readout.objects}</output></dd></div>
      <div><dt>Textures</dt><dd><output aria-label="Textures">{readout.textures}</output></dd></div>
    </dl>
    {error && <p role="alert">{error}</p>}
  </section>;
}
