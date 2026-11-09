'use client';
import { exampleSelectionNodeId } from '../example-selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ChefHat, ClipboardList, Crosshair, Eye, EyeOff, Info, Maximize2, Minimize2, Palette, UtensilsCrossed, X } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { SCENARIOS, STATIONS, TABLE_LAYOUT, applyRestaurantSnapshot, createRestaurantStore, nextPlateLoad, plateNode, plateRuns, stationTickets, type PlateLoad, type RestaurantScenario, type StationId } from './model';
import { CoolerInspector, EmptyInspector, RestaurantLibrary, restaurantHudMetrics, StationInspector, StationStrip, TableChips, TableInspector, TableLegend, TicketTable } from './components';
import '@opsorama/ui/styles.css';
import { catalogAssets } from '@opsorama/objects';

const SCENARIO_LABELS: Readonly<Record<RestaurantScenario, string>> = { rush: 'Friday dinner rush', quiet: 'Quiet afternoon', closed: 'After close' };
const SCENARIO_NOTES: Readonly<Record<RestaurantScenario, string>> = { rush: 'One late grill ticket and a warm walk-in reading.', quiet: 'A few tables and a short ticket queue.', closed: 'Stations idle, oven cold.' };
const DEFAULT_ZOOM = 1.05;
/** How often the host reads where plate carriers are; a server pauses at least 3 s at the pass and at a table. */
const PLATE_POLL_MS = 200;
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'floor' | 'tickets' | 'about';
type SidePanel = 'stations' | 'inspector';

/** Host-owned HUD over one React scene. Shared panels own presentation; mock data and commands stay in this example. */
function RestaurantViewport() {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<RestaurantScenario>('rush');
  const [station, setStation] = useState<StationId | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const snapshot = SCENARIOS[scenario], selection = exampleSelectionNodeId(scene);
  const [kind, id] = (selection ?? '').split(':') as [string, string | undefined];
  const selectedTable = kind === 'table' ? snapshot.tables.find(table => table.tableId === id) : undefined;
  const selectedStation = kind === 'station' ? id as StationId : null;
  const tickets = station ? stationTickets(snapshot, station) : snapshot.tickets;

  // A selection from the scene or a list opens the inspector; narrow layouts close the left panel that would cover it.
  const openInspector = useCallback(() => {
    setSidePanel('inspector'); setPanelsVisible(true);
    if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null);
  }, []);
  useEffect(() => { if (selection) openInspector(); }, [selection, openInspector]);
  // Servers empty their plates at the table they serve and refill them at the pass. The host reads each server's carry
  // anchor from the renderer, so the load follows the walk the renderer draws through pauses, speed changes and remounts.
  useEffect(() => {
    const runs = plateRuns(SCENARIOS[scenario]), loads: Record<string, PlateLoad> = {};
    if (!runs.length) return;
    const timer = window.setInterval(() => {
      const view = renderer.current;
      if (!view || view.getDiagnostics().disposed) return;
      for (const run of runs) {
        const carry = view.getAnchor(run.server, 'carry'), current = loads[run.server] ?? 'full';
        const next = carry ? nextPlateLoad(run, carry.position, current) : current;
        if (next !== current) { loads[run.server] = next; store.upsert(plateNode(run.server, next)); }
      }
    }, PLATE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [scenario, store]);
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);

  // Re-selecting the current record does not change the selection, so list clicks open the inspector directly.
  const select = (nodeId: string) => { store.select(nodeId, 'keyboard'); openInspector(); };
  // A station filters the ticket panel and opens its inspector; choosing it again clears the filter.
  const selectStation = (value: StationId | null) => { setStation(value); if (value) select(`station:${value}`); };
  const overview = () => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.overview(); store.select(null); };
  const changeScenario = (value: RestaurantScenario) => { applyRestaurantSnapshot(store, SCENARIOS[value]); setScenario(value); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'stations'} onClick={() => setSidePanel('stations')}>Stations</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;
  const inspector = selectedTable ? <TableInspector session={selectedTable} snapshot={snapshot} /> : selectedStation ? <StationInspector station={selectedStation} snapshot={snapshot} /> : selection === 'equipment:cooler' ? <CoolerInspector snapshot={snapshot} /> : <EmptyInspector />;
  const coolerInspected = sidePanel === 'inspector' && selection === 'equipment:cooler';
  const freeTables = snapshot.tables.filter(table => table.status === 'free').length;

  return <section className="rs-viewport hud-viewport" aria-label="Restaurant operations" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Restaurant navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><UtensilsCrossed size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 22 / RESTAURANT</span><h1>Restaurant floor &amp; kitchen</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="rs-snapshot">Mock snapshot</label><select id="rs-snapshot" aria-label="Mock snapshot" value={scenario} onChange={event => changeScenario(event.target.value as RestaurantScenario)}>{(Object.keys(SCENARIO_LABELS) as RestaurantScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.open ? 'Open' : 'Closed'}</span></div>
        <p className="hud-navigation-note" role="status">{SCENARIO_NOTES[scenario]} Mock data · no POS connection.</p>
      </DataPanel>
      <HudMetrics label="Service metrics" size={metricSize} metrics={restaurantHudMetrics(snapshot, {
        guests: { label: 'Open floor tables', onActivate: () => toggleLeft('floor'), pressed: leftPanel === 'floor' },
        tickets: { label: 'Open kitchen tickets', onActivate: () => toggleLeft('tickets'), pressed: leftPanel === 'tickets' },
        late: { label: 'Open kitchen stations', onActivate: () => toggleSide('stations'), pressed: sidePanel === 'stations' },
        cooler: { label: 'Inspect the walk-in cooler', onActivate: () => { if (coolerInspected) setSidePanel(null); else select('equipment:cooler'); }, pressed: coolerInspected },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'stations' && <DataPanel className="hud-side-panel" label="Kitchen stations" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Mock tickets · no kitchen display connection', state: 'unknown' }}>
      <StationStrip snapshot={snapshot} selected={station} onSelect={selectStation} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel rs-inspector-panel" label="Restaurant inspector" density="compact" slots={{ header: sideTabs }}>{inspector}</DataPanel>}

    {panelsVisible && leftPanel === 'floor' && <DataPanel className="hud-floating-panel rs-floor-panel" title="Floor" label="Floor tables" description={`${TABLE_LAYOUT.length} tables · ${freeTables} free · place settings show covers`} density="compact" slots={{ icon: <UtensilsCrossed size={16} />, actions: closeLeft }}>
      <TableChips snapshot={snapshot} selectedId={selectedTable?.tableId} onSelect={value => select(`table:${value}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'tickets' && <DataPanel className="hud-floating-panel rs-tickets-panel" title="Kitchen tickets" label="Kitchen tickets" description={`${tickets.length} of ${snapshot.tickets.length} in snapshot${station ? ` · ${STATIONS.find(item => item.id === station)!.label}` : ''}`} density="compact" slots={{ icon: <ClipboardList size={16} />, actions: closeLeft, footer: station ? <button type="button" className="hud-text-button" onClick={() => setStation(null)}>Clear station filter</button> : undefined }}>
      <TicketTable snapshot={snapshot} tickets={tickets} onSelectTable={value => select(`table:${value}`)} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel rs-about" title="Restaurant" label="Restaurant information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">Kitchen, bar, dining room, booths and terrace. Place settings show covers, plates on the pass and bags on the pickup shelf show ready orders, and each table tent shows the table status. Every model comes from the shared restaurant catalog.</p>
      <TableLegend />
      <RestaurantLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'floor' && panelsVisible} onClick={() => toggleLeft('floor')}><UtensilsCrossed size={14} />Floor</button><button type="button" aria-pressed={leftPanel === 'tickets' && panelsVisible} onClick={() => toggleLeft('tickets')}><ClipboardList size={14} />Tickets</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'stations' && panelsVisible} onClick={() => toggleSide('stations')}><ChefHat size={14} />Stations</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Restaurant motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select a table, station or the cooler</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function RestaurantDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  useEffect(() => { const session = createRestaurantStore(); setStore(session); return () => session.dispose(); }, []);
  return <main className="hud-page restaurant-page"><SiteHeader />{store ? <DashboardProvider store={store}><RestaurantViewport /></DashboardProvider> : <p className="rs-preparing">Preparing restaurant dashboard…</p>}</main>;
}
