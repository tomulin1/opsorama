'use client';
import { exampleSelectionNodeId } from '../example-selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Crosshair, Droplets, Eye, EyeOff, Info, LifeBuoy, Maximize2, Minimize2, Palette, Waves, X } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { SCENARIOS, applyAquaticsSnapshot, createAquaticsStore, laneNumber, type AquaticsScenario, type PoolId } from './model';
import { AquaticsLibrary, aquaticsHudMetrics, EmptyInspector, LaneChips, LaneInspector, LaneLegend, PlantInspector, PostInspector, PostStrip, WaterInspector, WaterTable } from './components';
import '@opsorama/ui/styles.css';
import { catalogAssets } from '@opsorama/objects';

const SCENARIO_LABELS: Readonly<Record<AquaticsScenario, string>> = { morning: 'Early lane swim', afternoon: 'Afternoon family session', closed: 'After close' };
const DEFAULT_ZOOM = 1.15;
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'lanes' | 'water' | 'about';
type SidePanel = 'posts' | 'inspector';

function scenarioNote(scenario: AquaticsScenario) {
  const alertLane = SCENARIOS.afternoon.lanes.find(session => session.alert)?.laneId ?? 'L4';
  return scenario === 'afternoon' ? `Lane ${laneNumber(alertLane)} alert, an empty teaching-pool chair and low chlorine in the teaching pool.` : scenario === 'morning' ? 'One full public lane; all posts covered.' : 'Pool covered, staff off duty.';
}

/** Host-owned HUD over one React scene. Shared panels own presentation; mock data and commands stay in this example. */
function AquaticsViewport() {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<AquaticsScenario>('afternoon');
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const snapshot = SCENARIOS[scenario], selection = exampleSelectionNodeId(scene);
  const [kind, id] = (selection ?? '').split(':') as [string, string | undefined];
  const selectedLane = kind === 'lane' ? snapshot.lanes.find(session => session.laneId === id) : undefined;
  const selectedPost = kind === 'post' ? snapshot.posts.find(post => post.id === id) : undefined;
  const selectedPool = kind === 'pool' || kind === 'dosing' ? id as PoolId : undefined;

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

  // Re-selecting the current record does not change the selection, so list clicks open the inspector directly.
  const select = (nodeId: string) => { store.select(nodeId, 'keyboard'); openInspector(); };
  const overview = () => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.overview(); store.select(null); };
  const changeScenario = (value: AquaticsScenario) => { applyAquaticsSnapshot(store, SCENARIOS[value]); setScenario(value); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'posts'} onClick={() => setSidePanel('posts')}>Lifeguards</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;
  const inspector = selectedLane ? <LaneInspector session={selectedLane} /> : selectedPost ? <PostInspector post={selectedPost} snapshot={snapshot} /> : selectedPool ? <WaterInspector pool={selectedPool} snapshot={snapshot} /> : kind === 'filter' ? <PlantInspector snapshot={snapshot} /> : <EmptyInspector snapshot={snapshot} />;
  const openLanes = snapshot.lanes.filter(session => session.use !== 'closed');

  return <section className="aq-viewport hud-viewport" aria-label="Aquatic centre" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Aquatic centre navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Waves size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 29 / AQUATIC CENTRE</span><h1>Pool deck &amp; plant room</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="aq-snapshot">Mock snapshot</label><select id="aq-snapshot" aria-label="Mock snapshot" value={scenario} onChange={event => changeScenario(event.target.value as AquaticsScenario)}>{(Object.keys(SCENARIO_LABELS) as AquaticsScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.open ? 'Open' : 'Closed'}</span></div>
        <p className="hud-navigation-note" role="status">{scenarioNote(scenario)} Mock data · no booking or sensor connection.</p>
      </DataPanel>
      <HudMetrics label="Pool metrics" size={metricSize} metrics={aquaticsHudMetrics(snapshot, {
        bathers: { label: 'Open lane occupancy', onActivate: () => toggleLeft('lanes'), pressed: leftPanel === 'lanes' },
        lanes: { label: 'Open lane overview', onActivate: () => toggleLeft('lanes'), pressed: leftPanel === 'lanes' },
        posts: { label: 'Open lifeguard posts', onActivate: () => toggleSide('posts'), pressed: sidePanel === 'posts' },
        water: { label: 'Open water quality', onActivate: () => toggleLeft('water'), pressed: leftPanel === 'water' },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'posts' && <DataPanel className="hud-side-panel" label="Lifeguard posts" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Mock rota · no staffing connection', state: 'unknown' }}>
      <PostStrip snapshot={snapshot} selected={selectedPost?.id} onSelect={value => select(`post:${value}`)} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel aq-inspector-panel" label="Pool inspector" density="compact" slots={{ header: sideTabs }}>{inspector}</DataPanel>}

    {panelsVisible && leftPanel === 'lanes' && <DataPanel className="hud-floating-panel aq-lanes-panel" title="Lanes" label="Lane overview" description={`${openLanes.length} open · ${openLanes.filter(session => session.swimmers >= session.capacity).length} full · up to four swimmers shown per lane`} density="compact" slots={{ icon: <Waves size={16} />, actions: closeLeft }}>
      <LaneChips snapshot={snapshot} selectedId={selectedLane?.laneId} onSelect={value => select(`lane:${value}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'water' && <DataPanel className="hud-floating-panel aq-water-panel" title="Water quality" label="Water quality" description="Mock limits: pH 7.0–7.6, free chlorine 0.30–1.00 mg/l" density="compact" slots={{ icon: <Droplets size={16} />, actions: closeLeft, footer: <button type="button" className="hud-text-button" onClick={() => select('filter:F1')}>Inspect filtration</button> }}>
      <WaterTable snapshot={snapshot} onSelect={pool => select(`dosing:${pool}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel aq-about" title="Aquatic centre" label="Aquatic centre information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">A 25 m six-lane pool, a teaching pool and a plant room. Swimmers show lane occupancy (up to four per lane); starting-block lamps, chair flags and plant LEDs show status. Water limits are mock values, not regulatory guidance.</p>
      <LaneLegend />
      <AquaticsLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'lanes' && panelsVisible} onClick={() => toggleLeft('lanes')}><Waves size={14} />Lanes</button><button type="button" aria-pressed={leftPanel === 'water' && panelsVisible} onClick={() => toggleLeft('water')}><Droplets size={14} />Water</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'posts' && panelsVisible} onClick={() => toggleSide('posts')}><LifeBuoy size={14} />Lifeguards</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Pool motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select a lane, chair or plant</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function AquaticsDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  useEffect(() => { const session = createAquaticsStore(); setStore(session); return () => session.dispose(); }, []);
  return <main className="hud-page aquatics-page"><SiteHeader />{store ? <DashboardProvider store={store}><AquaticsViewport /></DashboardProvider> : <p className="aq-preparing">Preparing aquatic centre dashboard…</p>}</main>;
}
