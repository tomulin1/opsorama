'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { siteEnergyDefinition, updateSiteEnergy, type SiteEnergyOptions, type SiteEnergySession } from '../../../examples/site-energy-data';
import type { SceneRenderer } from '@opsorama/renderer-three';

export function SiteEnergyExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [options, setOptions] = useState<SiteEnergyOptions>({ midnight: false, chargerFault: false, turbineStopped: false });
  const [selected, setSelected] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<SiteEnergySession | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: SiteEnergySession | undefined, unsubscribe: (() => void) | undefined;
    setError(null); setSelected(null);
    const ready = (value: SceneRenderer) => { if (active) renderer.current = value; };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/site-energy-react')).mountSiteEnergyReact : adapter === 'Vue' ? (await import('../../../examples/site-energy-vue')).mountSiteEnergyVue : (await import('../../../examples/site-energy-javascript')).mountSiteEnergyJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, ready); session.current = view;
      updateSiteEnergy(view.store, latest.current);
      unsubscribe = view.store.subscribe(() => setSelected(view?.store.getSnapshot().selection?.nodeId ?? null));
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; unsubscribe?.(); view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { if (session.current) updateSiteEnergy(session.current.store, options); }, [options]);
  const toggle = (key: keyof SiteEnergyOptions, label: string) => <label>{label} <input aria-label={label} type="checkbox" checked={options[key]} onChange={event => setOptions(value => ({ ...value, [key]: event.target.checked }))} /></label>;
  return <section className="datacenter-example" aria-label="Site and energy kit">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="datacenter-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    {error && <p role="alert">{error}</p>}
    <div className="datacenter-controls">{toggle('chargerFault', 'Charger 1 fault')}{toggle('turbineStopped', 'Turbine stopped')}{toggle('midnight', 'Midnight palette')}</div>
    <p role="status">Selected: {siteEnergyDefinition.nodes.find(node => node.id === selected)?.label ?? 'none'}</p>
    <div className="datacenter-records">{siteEnergyDefinition.nodes.filter(node => node.kind === 'asset' && node.selectable).map(node => <div key={node.id}><button disabled={!mounted} aria-pressed={selected === node.id} onClick={() => { session.current?.store.select(node.id, 'keyboard'); renderer.current?.frame(node.id); }}>{node.label}</button>{node.kind === 'asset' && <Link href={`/docs/objects/${node.asset}`}>Model details</Link>}</div>)}</div>
  </section>;
}
