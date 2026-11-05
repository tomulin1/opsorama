'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel, FieldList, StatusBadge, ZoomControl } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { createPerformanceStore, DEFAULT_PERFORMANCE_PRESET, PERFORMANCE_FIXTURE_VERSION, PERFORMANCE_PRESETS, PERFORMANCE_ZOOM, performanceNodes, type PerformancePreset } from './model';
import { PerformanceReadout } from './PerformanceReadout';
import '@opsorama/ui/styles.css';
import './performance.css';
import { catalogAssets } from '@opsorama/objects';

/** One stable adapter mount. Panels and diagnostics are host-owned and never enter the shared renderer. */
function PerformanceViewport({ initialPreset, initialInstancing }: { initialPreset: PerformancePreset; initialInstancing: boolean }) {
  const store = useSceneStore(), snapshot = useScene(), settings = snapshot.settings;
  const renderer = useRef<SceneRenderer | null>(null), surface = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<PerformancePreset>(initialPreset), [pendingPreset, setPendingPreset] = useState<PerformancePreset>(initialPreset);
  const [instancing, setInstancing] = useState(initialInstancing);
  const [mounted, setMounted] = useState(true), [expanded, setExpanded] = useState(false), [panels, setPanels] = useState(true), [error, setError] = useState<string | null>(null), [invalidation, setInvalidation] = useState(0);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; setError(null); }, []);
  const onError = useCallback((failure: Error) => { setError(failure.message); }, []);
  const invalidate = () => setInvalidation(value => value + 1);
  const overview = () => { store.configure({ zoom: PERFORMANCE_ZOOM }); renderer.current?.overview(); invalidate(); };
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);
  const instances = PERFORMANCE_PRESETS[preset].instances;
  const selected = snapshot.nodes.find(node => node.id === snapshot.selection?.nodeId);
  return <section className="perf-viewport" aria-label="Performance stress scene" data-expanded={expanded}>
    <div className="perf-scene" ref={surface} onPointerDownCapture={invalidate} onWheelCapture={invalidate}>
      {mounted ? <SceneCanvas assets={catalogAssets} instancing={instancing} wheelZoom onReady={onReady} onError={onError} /> : <div className="perf-placeholder">Scene unmounted · controls and the last recording remain available</div>}
    </div>
    <div className="perf-toolbar"><button type="button" aria-pressed={panels} onClick={() => setPanels(value => !value)}>{panels ? 'Hide panels' : 'Show panels'}</button><button type="button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Exit expanded view' : 'Expand scene'}</button></div>
    <div className="perf-hud" hidden={!panels} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <DataPanel title="Performance playground" description="One deterministic scene for comparing renderer changes." density="compact">
        <div className="perf-heading"><StatusBadge label={`${instances.toLocaleString('en-US')} model instances`} tone="info" /><span>8 catalog models · {PERFORMANCE_FIXTURE_VERSION}</span></div>
        <label className="perf-load">Load<select value={pendingPreset} onChange={event => setPendingPreset(event.target.value as PerformancePreset)}>{Object.entries(PERFORMANCE_PRESETS).map(([key, definition]) => <option key={key} value={key}>{definition.label} · {definition.instances.toLocaleString('en-US')} instances</option>)}</select></label>
        <button type="button" disabled={pendingPreset === preset} onClick={() => { invalidate(); store.replace(performanceNodes(pendingPreset)); store.select(null); setPreset(pendingPreset); const url = new URL(window.location.href); url.searchParams.set('load', pendingPreset); window.history.replaceState(null, '', url); overview(); }}>Apply load</button>
        <p className="perf-note">Mega intentionally stresses the browser. Load changes build real model geometry and can take a moment.</p>
        <div className="perf-toggles">{(['motion', 'shadows', 'labels'] as const).map(key => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => { invalidate(); store.configure({ [key]: event.target.checked }); }} />{key === 'labels' ? 'All labels' : key === 'motion' ? 'Motion' : 'Shadows'}</label>)}</div>
        <label className="perf-instancing"><input type="checkbox" checked={instancing} onChange={event => { const enabled = event.target.checked; invalidate(); renderer.current = null; store.select(null); store.configure({ zoom: PERFORMANCE_ZOOM }); setInstancing(enabled); const url = new URL(window.location.href); if (enabled) url.searchParams.delete('instancing'); else url.searchParams.set('instancing', 'off'); window.history.replaceState(null, '', url); }} />Instancing</label>
        <p className="perf-note">Switching instancing recreates the renderer and resets the camera. Counts and model detail stay equal.</p>
        <ZoomControl value={settings.zoom} onChange={zoom => { invalidate(); store.configure({ zoom }); }} reset onReset={overview} caption="Camera zoom" />
        <div className="perf-actions"><button type="button" onClick={overview} disabled={!mounted}>Reset overview</button><button type="button" onClick={() => { renderer.current = null; setMounted(value => !value); invalidate(); }}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
        <FieldList fields={[{ id: 'selection', label: 'Selected model', value: selected?.label ?? 'None' }, { id: 'movement', label: 'Route followers', value: instances / 8 }]} />
        <p className="perf-note">Drag to pan; click a model to inspect it. Counts are synthetic instances. All loads use the same model scale and fixed per-model quantities.</p>
      </DataPanel>
      {error && <DataPanel title="Scene unavailable" state="error" slots={{ error: <span>{error} Try unmounting and mounting the scene, or apply a smaller load.</span> }} />}
      <PerformanceReadout rendererRef={renderer} surfaceRef={surface} mounted={mounted && !error} configuration={{ preset, instances, instancing, motion: settings.motion, shadows: settings.shadows, labels: settings.labels, zoom: settings.zoom }} invalidation={invalidation} />
    </div>
    <div className="perf-caption">Synthetic catalog stress test · no automatic quality changes · compare the same load, camera, viewport and build mode</div>
  </section>;
}

export function PerformanceDashboard() {
  const [session, setSession] = useState<{ store: SceneStore; preset: PerformancePreset; instancing: boolean } | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('load');
    const preset = requested && Object.hasOwn(PERFORMANCE_PRESETS, requested) ? requested as PerformancePreset : DEFAULT_PERFORMANCE_PRESET;
    const store = createPerformanceStore(preset); setSession({ store, preset, instancing: new URLSearchParams(window.location.search).get('instancing') !== 'off' }); return () => store.dispose();
  }, []);
  return <main className="perf-page"><SiteHeader />{session ? <DashboardProvider store={session.store}><PerformanceViewport initialPreset={session.preset} initialInstancing={session.instancing} /></DashboardProvider> : <div className="perf-placeholder">Preparing performance fixture…</div>}</main>;
}
