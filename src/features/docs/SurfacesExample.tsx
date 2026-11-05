'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { surfacesDefinition, updateSurfaces, type SurfacesSession } from '../../../examples/surfaces-data';
import { FLOOR_FINISHES, type FloorFinish, type SceneRenderer } from '@opsorama/renderer-three';

export function SurfacesExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [finish, setFinish] = useState<FloorFinish>('tiles'), [midnight, setMidnight] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<SurfacesSession | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef({ finish, midnight }); latest.current = { finish, midnight };
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: SurfacesSession | undefined, unsubscribe: (() => void) | undefined;
    setError(null); setSelected(null);
    const ready = (value: SceneRenderer) => { if (active) renderer.current = value; };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/surfaces-react')).mountSurfacesReact : adapter === 'Vue' ? (await import('../../../examples/surfaces-vue')).mountSurfacesVue : (await import('../../../examples/surfaces-javascript')).mountSurfacesJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, ready); session.current = view;
      const config = latest.current; updateSurfaces(view.store, config.finish, config.midnight);
      unsubscribe = view.store.subscribe(() => setSelected(view?.store.getSnapshot().selection?.nodeId ?? null));
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; unsubscribe?.(); view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { if (session.current) updateSurfaces(session.current.store, finish, midnight); }, [finish, midnight]);
  return <section className="datacenter-example" aria-label="Surfaces kit">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="datacenter-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    {error && <p role="alert">{error}</p>}
    <div className="datacenter-controls"><label>Terrace floor <select aria-label="Terrace floor finish" value={finish} onChange={event => setFinish(event.target.value as FloorFinish)}>{FLOOR_FINISHES.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Midnight palette <input aria-label="Midnight palette" type="checkbox" checked={midnight} onChange={event => setMidnight(event.target.checked)} /></label></div>
    <p role="status">Selected: {surfacesDefinition.nodes.find(node => node.id === selected)?.label ?? 'none'}</p>
    <div className="datacenter-records">{surfacesDefinition.nodes.filter(node => node.kind === 'asset' && node.selectable).map(node => <div key={node.id}><button disabled={!mounted} aria-pressed={selected === node.id} onClick={() => { session.current?.store.select(node.id, 'keyboard'); renderer.current?.frame(node.id); }}>{node.label}</button>{node.kind === 'asset' && <Link href={`/docs/objects/${node.asset}`}>Model details</Link>}</div>)}</div>
  </section>;
}
