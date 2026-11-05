'use client';
import { useEffect, useRef, useState } from 'react';
import type { MoveModeSnapshot } from '@opsorama/core';
import { moveModeUnits, targetLabel, type MoveModeSession } from '../../../examples/move-mode-data';

const OFF: MoveModeSnapshot = { unit: null, targets: [], refusals: [] };

/** Neutral sample of optional move mode: scene markers and the same choices as an HTML list. */
export function MoveModeExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [snapshot, setSnapshot] = useState<MoveModeSnapshot>(OFF), [log, setLog] = useState<readonly string[]>([]), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), session = useRef<MoveModeSession | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: MoveModeSession | undefined, stop: (() => void)[] = [];
    setError(null); setSnapshot(OFF); setLog([]);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/move-mode-react')).mountMoveModeReact : adapter === 'Vue' ? (await import('../../../examples/move-mode-vue')).mountMoveModeVue : (await import('../../../examples/move-mode-javascript')).mountMoveModeJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, () => {}); session.current = view;
      const current = view;
      stop = [current.mode.subscribe(() => setSnapshot(current.mode.getSnapshot())), current.subscribeLog(() => setLog(current.getLog()))];
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; stop.forEach(unsubscribe => unsubscribe()); view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') session.current?.store.select(null, 'keyboard'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const moving = moveModeUnits.find(entry => entry.id === snapshot.unit);
  return <section className="datacenter-example" aria-label="Move mode">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="datacenter-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    {error && <p role="alert">{error}</p>}
    <p role="status">{moving ? `Moving ${moving.label}: ${snapshot.targets.length} compatible ${snapshot.targets.length === 1 ? 'place' : 'places'}` : 'Select a parcel, tote or pallet to move it.'}</p>
    <h2 className="move-mode-heading">Units</h2>
    <div className="datacenter-records">{moveModeUnits.map(entry => <div key={entry.id}><button disabled={!mounted} aria-pressed={snapshot.unit === entry.id} onClick={() => session.current?.store.select(entry.id, 'keyboard')}>{entry.label}</button></div>)}</div>
    {moving && <>
      <h2 className="move-mode-heading">Compatible places</h2>
      {snapshot.targets.length ? <div className="datacenter-records">{snapshot.targets.map(target => <div key={targetLabel(target)}><button onClick={() => session.current?.mode.request(target)}>{targetLabel(target)}</button></div>)}</div> : <p>No compatible free place.</p>}
      <div className="datacenter-records"><div><button onClick={() => session.current?.store.select(null, 'keyboard')}>Cancel move (Esc)</button></div></div>
      {snapshot.refusals.length > 0 && <details className="move-mode-refusals"><summary>Why other places are not offered ({snapshot.refusals.length})</summary><ul>{snapshot.refusals.map(refusal => <li key={`${refusal.container}:${refusal.receptacle}`}><strong>{refusal.container} {refusal.receptacle}:</strong> {refusal.violations[0].message}</li>)}</ul></details>}
    </>}
    {log.length > 0 && <><h2 className="move-mode-heading">Requests</h2><ul className="move-mode-log">{log.map((entry, index) => <li key={`${index}:${entry}`}>{entry}</li>)}</ul></>}
  </section>;
}
