'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BUILDING_TYPES, BUILDING_TYPE_LABELS, isBuilding, isInteriorVisible, setBuildingView, type BuildingType, type BuildingLoadState, type SceneSnapshot } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/renderer-three';
import type { BuildingSession, BuildingStateCallback } from '../../../examples/building-data';

export function BuildingExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [snapshot, setSnapshot] = useState<SceneSnapshot>(), [states, setStates] = useState<Record<string, BuildingLoadState>>({});
  const [error, setError] = useState<string>(), [objects, setObjects] = useState(0), [geometries, setGeometries] = useState(0);
  const container = useRef<HTMLDivElement>(null), session = useRef<BuildingSession>(null), renderer = useRef<SceneRenderer>(null);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: BuildingSession | undefined, unsubscribe: (() => void) | undefined;
    setError(undefined); setSnapshot(undefined); setStates({}); setObjects(0);
    const onState: BuildingStateCallback = (id, state, failure) => { if (active) { setStates(value => ({ ...value, [id]: state })); if (failure) setError(failure.message); } };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/building-react')).mountBuildingReact : adapter === 'Vue' ? (await import('../../../examples/building-vue')).mountBuildingVue : (await import('../../../examples/building-javascript')).mountBuildingJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, value => { if (active) renderer.current = value; }, onState); session.current = view;
      const update = () => { if (active) setSnapshot(view?.store.getSnapshot()); }; unsubscribe = view.store.subscribe(update); update();
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    const diagnostic = setInterval(() => { if (active) { const metrics = renderer.current?.getDiagnostics(); setObjects(metrics?.objects ?? 0); setGeometries(metrics?.geometries ?? 0); } }, 300);
    return () => { active = false; clearInterval(diagnostic); unsubscribe?.(); view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  const selected = snapshot?.nodes.find(node => node.id === snapshot.selection?.nodeId);
  return <section aria-label="Building containers">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface">{mounted ? <div key={adapter} ref={container} className="building-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <p>Hover over a building to peek. Open it to keep the cutaway visible while inspecting its contents. Each building loads independently.</p>
    {error && <p role="alert">{error}</p>}
    <div className="building-controls">{snapshot?.nodes.filter(isBuilding).map(node => <article key={node.id}>
      <h2>{node.label}</h2><p data-testid={`${node.id}-state`}>{node.building?.view ?? 'closed'} · {states[node.id] ?? 'idle'}</p>
      <label>Building type<select aria-label={`${node.label} building type`} value={node.building?.type ?? 'generic'} disabled={!mounted} onChange={event => session.current?.store.upsert({ ...node, building: { ...node.building, type: event.target.value as BuildingType } })}>{BUILDING_TYPES.map(type => <option key={type} value={type}>{BUILDING_TYPE_LABELS[type]}</option>)}</select></label>
      <button disabled={!mounted} aria-expanded={(node.building?.view ?? 'closed') !== 'closed'} onClick={() => { if (session.current) setBuildingView(session.current.store, node.id, node.building?.view === 'open' ? 'closed' : 'open'); }}>{node.building?.view === 'open' ? 'Close' : 'Open'} {node.label}</button>
      <ul>{snapshot.nodes.filter(child => child.parentId === node.id).map(child => <li key={child.id}><button disabled={!mounted || !isInteriorVisible(child, snapshot.nodes)} onClick={() => session.current?.store.select(child.id, 'keyboard')}>{child.label}</button></li>)}</ul>
    </article>)}</div>
    <p role="status">Selected: {selected?.label ?? 'none'}</p><p data-testid="rendered-objects">Rendered nodes: {mounted ? objects : 0}</p><p data-testid="geometry-resources">Geometry resources: {mounted ? geometries : 0}</p>
    <div className="adapter-example-tabs"><button disabled={!mounted} onClick={() => renderer.current?.overview()}>Overview</button><button disabled={!mounted} onClick={() => session.current?.store.configure({ theme: snapshot?.settings.theme === 'light' ? 'midnight' : 'light' })}>Change palette</button></div>
    <p>Fixture objects have no business records. Interior transforms inherit the building transform; placement and loading rules stay in the host. <Link href="/docs/buildings">Read the container API</Link>.</p>
  </section>;
}
