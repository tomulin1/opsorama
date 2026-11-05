'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logisticsDefinition, updateLogistics, type LogisticsSession } from '../../../examples/logistics-data';
import type { SceneRenderer } from '@opsorama/renderer-three';

export function LogisticsExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [open, setOpen] = useState(false), [midnight, setMidnight] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<LogisticsSession | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef({ open, midnight }); latest.current = { open, midnight };
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: LogisticsSession | undefined, unsubscribe: (() => void) | undefined;
    setError(null); setSelected(null);
    const ready = (value: SceneRenderer) => { if (active) renderer.current = value; };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/logistics-react')).mountLogisticsReact : adapter === 'Vue' ? (await import('../../../examples/logistics-vue')).mountLogisticsVue : (await import('../../../examples/logistics-javascript')).mountLogisticsJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, ready); session.current = view;
      const config = latest.current; updateLogistics(view.store, config.open, config.midnight);
      unsubscribe = view.store.subscribe(() => setSelected(view?.store.getSnapshot().selection?.nodeId ?? null));
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; unsubscribe?.(); view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { if (session.current) updateLogistics(session.current.store, open, midnight); }, [open, midnight]);
  return <section className="datacenter-example" aria-label="Logistics kit">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="datacenter-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    {error && <p role="alert">{error}</p>}
    <div className="datacenter-controls"><label>Open dock <input aria-label="Open dock" type="checkbox" checked={open} onChange={event => setOpen(event.target.checked)} /></label><label>Midnight palette <input aria-label="Midnight palette" type="checkbox" checked={midnight} onChange={event => setMidnight(event.target.checked)} /></label></div>
    <p role="status">Selected: {logisticsDefinition.nodes.find(node => node.id === selected)?.label ?? 'none'}</p>
    <div className="datacenter-records">{logisticsDefinition.nodes.filter(node => node.kind === 'asset' && node.selectable).map(node => <div key={node.id}><button disabled={!mounted} aria-pressed={selected === node.id} onClick={() => { session.current?.store.select(node.id, 'keyboard'); renderer.current?.frame(node.id); }}>{node.label}</button>{node.kind === 'asset' && <Link href={`/docs/objects/${node.asset}`}>Model details</Link>}</div>)}</div>
  </section>;
}
