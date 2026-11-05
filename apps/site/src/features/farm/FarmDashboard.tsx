'use client';
import { exampleSelectionNodeId } from '../example-selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bird, ClipboardList, Crosshair, Eye, EyeOff, Info, Maximize2, Minimize2, Palette, Wheat, X, Tractor } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { FARM_NAME, SCENARIOS, farmMetrics, type FarmScenario, type FieldId, type PenId } from './model';
import { DEFAULT_ZOOM, applyFarmSnapshot, createFarmStore } from './scene';
import { AlertList, AnimalInspector, EmptyInspector, FarmLibrary, farmHudMetrics, FieldInspector, FieldTable, PenChips, PenInspector, TaskList, TroughInspector, YardInspector } from './components';
import '@opsorama/ui/styles.css';
import { catalogAssets } from '@opsorama/objects';

const SCENARIO_LABELS: Readonly<Record<FarmScenario, string>> = { morning: 'Morning chores', heat: 'Hot afternoon', harvest: 'Harvest day' };
const SCENARIO_NOTES: Readonly<Record<FarmScenario, string>> = {
  morning: 'Milking done, pigs not yet fed, a slow sheep trough and a lame cow on the watch list.',
  heat: 'The dairy tank is empty, a cow shows heat stress and a ewe is missing at the afternoon count.',
  harvest: 'The tractor works Long Meadow, North Acre is cut and the vet is at the pig pen.',
};
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'pens' | 'fields' | 'tasks' | 'about';
type SidePanel = 'alerts' | 'inspector';

/** Host-owned HUD over one React scene. Shared panels own presentation; mock data stays in this example. */
function FarmViewport() {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<FarmScenario>('heat');
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const snapshot = SCENARIOS[scenario], selection = exampleSelectionNodeId(scene), metrics = farmMetrics(snapshot);
  const [kind, id = ''] = (selection ?? '').split(':') as [string, string | undefined];

  // A selection from the scene or a list opens the inspector; narrow layouts close the left panel that would cover it.
  const openInspector = useCallback(() => {
    setSidePanel('inspector'); setPanelsVisible(true);
    if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null);
  }, []);
  useEffect(() => { if (selection) openInspector(); }, [selection, openInspector]);
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);

  // Re-selecting the current node does not change the selection, so list clicks open the inspector directly.
  const select = (nodeId: string) => { store.select(nodeId, 'keyboard'); openInspector(); };
  const overview = () => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.overview(); store.select(null); };
  const changeScenario = (value: FarmScenario) => { applyFarmSnapshot(store, SCENARIOS[value]); setScenario(value); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'alerts'} onClick={() => setSidePanel('alerts')}>Alerts</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;

  const inspector = kind === 'pin' ? <PenInspector snapshot={snapshot} id={id as PenId} />
    : kind === 'trough' ? <TroughInspector snapshot={snapshot} id={id as PenId} />
    : kind === 'animal' ? <AnimalInspector snapshot={snapshot} tag={id} />
    : kind === 'field' ? <FieldInspector snapshot={snapshot} id={id as FieldId} tractor={snapshot.tractor.status === 'working' && snapshot.tractor.field === id} />
    : kind === 'silo' || kind === 'tractor' || kind === 'coop' || kind === 'barn' ? <YardInspector snapshot={snapshot} node={selection!} />
    : <EmptyInspector />;

  return <section className="fm-viewport hud-viewport" aria-label="Farm" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Farm navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Tractor size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 26 / AGRICULTURE</span><h1>{FARM_NAME}</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="fm-snapshot">Mock snapshot</label><select id="fm-snapshot" aria-label="Mock snapshot" value={scenario} onChange={event => changeScenario(event.target.value as FarmScenario)}>{(Object.keys(SCENARIO_LABELS) as FarmScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.weather}</span></div>
        <p className="hud-navigation-note" role="status">{SCENARIO_NOTES[scenario]} Mock data · no herd, sensor or field records connection.</p>
      </DataPanel>
      <HudMetrics label="Farm metrics" size={metricSize} metrics={farmHudMetrics(snapshot, {
        livestock: { label: 'Open livestock pens', onActivate: () => toggleLeft('pens'), pressed: leftPanel === 'pens' },
        alerts: { label: 'Open farm alerts', onActivate: () => toggleSide('alerts'), pressed: sidePanel === 'alerts' },
        troughs: { label: 'Open pens with trough levels', onActivate: () => toggleLeft('pens'), pressed: leftPanel === 'pens' },
        tasks: { label: "Open today's tasks", onActivate: () => toggleLeft('tasks'), pressed: leftPanel === 'tasks' },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'alerts' && <DataPanel className="hud-side-panel" label="Farm alerts" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Mock snapshot · no live feed', state: 'unknown' }}>
      <AlertList snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel fm-inspector-panel" label="Farm inspector" density="compact" slots={{ header: sideTabs }}>{inspector}</DataPanel>}

    {panelsVisible && leftPanel === 'pens' && <DataPanel className="hud-floating-panel" title="Livestock" label="Pens" description={`${metrics.animals} animals in five pens · up to ten shown per pen · bar = trough level`} density="compact" slots={{ icon: <Bird size={16} />, actions: closeLeft }}>
      <PenChips snapshot={snapshot} selected={kind === 'pin' ? id as PenId : undefined} onSelect={value => select(`pin:${value}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'fields' && <DataPanel className="hud-floating-panel" title="Fields" label="Fields" description="Crop stage, soil moisture and the next field job" density="compact" slots={{ icon: <Wheat size={16} />, actions: closeLeft }}>
      <FieldTable snapshot={snapshot} onSelect={value => select(`field:${value}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'tasks' && <DataPanel className="hud-floating-panel fm-tasks-panel" title="Today's tasks" label="Tasks" description={`${metrics.open} open${metrics.overdue ? ` · ${metrics.overdue} overdue` : ''}`} density="compact" slots={{ icon: <ClipboardList size={16} />, actions: closeLeft }}>
      <TaskList snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel fm-about" title="Farm" label="Farm information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">A mixed farm: a barn, two grain silos, five pens with their troughs, a hen house and three fields along the lane. Each pen shows up to ten animals while the panels keep the exact headcount; pins, troughs and animal tags take the colour of their state. Fields and pens are drawn smaller than their real area. A dog, the farmer and two birds move on fixed routes, and the tractor works a field on harvest day. Nothing here tracks real animals or machinery; every model comes from the shared catalog.</p>
      <FarmLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'pens' && panelsVisible} onClick={() => toggleLeft('pens')}><Bird size={14} />Pens</button><button type="button" aria-pressed={leftPanel === 'fields' && panelsVisible} onClick={() => toggleLeft('fields')}><Wheat size={14} />Fields</button><button type="button" aria-pressed={leftPanel === 'tasks' && panelsVisible} onClick={() => toggleLeft('tasks')}><ClipboardList size={14} />Tasks</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'alerts' && panelsVisible} onClick={() => toggleSide('alerts')}><AlertTriangle size={14} />Alerts</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Farm motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select a pin, trough, animal or field</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function FarmDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  useEffect(() => { const session = createFarmStore(); setStore(session); return () => session.dispose(); }, []);
  return <main className="hud-page farm-page"><SiteHeader />{store ? <DashboardProvider store={store}><FarmViewport /></DashboardProvider> : <p className="fm-preparing">Preparing farm dashboard…</p>}</main>;
}
