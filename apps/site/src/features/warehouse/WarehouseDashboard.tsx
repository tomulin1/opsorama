'use client';
import { exampleSelectionNodeId } from '../example-selection';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, Boxes, Crosshair, Eye, EyeOff, Forklift, Info, Maximize2, Minimize2, PackageCheck, Palette, Truck, Warehouse, X } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudNodePreview, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { SCENARIOS, SITE_NAME, warehouseAlerts, warehouseMetrics, type AisleId, type AreaId, type DockId, type Side, type WarehouseScenario, type WarehouseSnapshot } from './model';
import { DEFAULT_ZOOM, applyWarehouseSnapshot, createWarehouseStore } from './scene';
import {
  AisleInspector, AlertList, AreaInspector, ChilledInspector, DockInspector, DockTable, EmptyInspector, FleetList, LoadTable, LocationInspector, StorageChips, TruckInspector, VehicleInspector,
  WarehouseLibrary, warehouseHudMetrics,
} from './components';
import '@opsorama/ui/styles.css';
import { catalogAssets } from '@opsorama/objects';

const SCENARIO_LABELS: Readonly<Record<WarehouseScenario, string>> = { inbound: 'Morning inbound peak', dispatch: 'Afternoon dispatch wave', night: 'Night replenishment' };
const SCENARIO_NOTES: Readonly<Record<WarehouseScenario, string>> = {
  inbound: 'Six receiving doors busy, a late import truck, a full lane at D04 and a leveler fault at D08.',
  dispatch: 'Route 3 may miss 14:45, the chilled door was left open, a forklift hit an upright in A04 and is tagged out.',
  night: 'Docks mostly quiet: reach trucks top up pick faces for the 05:00 wave and the robots charge.',
};
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'docks' | 'loads' | 'storage' | 'fleet' | 'about';
type SidePanel = 'alerts' | 'inspector';

/** The scene node a selection shows in the inspector preview; an alert marker shows the node it points at. */
function previewNodeFor(snapshot: WarehouseSnapshot, selection: string | null): string | null {
  return selection?.startsWith('alert:') ? warehouseAlerts(snapshot).find(value => `alert:${value.id}` === selection)?.node ?? null : selection;
}

/** The inspector for a selected node id; alert markers open the inspector of the node they point at. */
function inspectorFor(snapshot: WarehouseSnapshot, selection: string | null): ReactNode {
  if (!selection) return <EmptyInspector />;
  const [kind, id = '', bay, side] = selection.split(':');
  if (kind === 'alert') { const alert = warehouseAlerts(snapshot).find(value => `alert:${value.id}` === selection); return alert ? inspectorFor(snapshot, alert.node) : <EmptyInspector />; }
  if (kind === 'area' || kind === 'pin') return <AreaInspector snapshot={snapshot} id={id as AreaId} />;
  if (kind === 'chilled') return <ChilledInspector snapshot={snapshot} />;
  if (kind === 'dock') return <DockInspector snapshot={snapshot} id={id as DockId} />;
  if (kind === 'truck') return <TruckInspector snapshot={snapshot} id={id} />;
  if (kind === 'aisle') return <AisleInspector snapshot={snapshot} id={id as AisleId} />;
  if (kind === 'rack') return <LocationInspector snapshot={snapshot} aisle={id as AisleId} bay={Number(bay)} side={side as Side} />;
  if (kind === 'mhe') return <VehicleInspector snapshot={snapshot} id={id} />;
  if (kind === 'pack') return <AreaInspector snapshot={snapshot} id="packing" />;
  if (kind === 'returns') return <AreaInspector snapshot={snapshot} id="returns" />;
  return <EmptyInspector />;
}

/** Host-owned HUD over one React scene. Shared panels own presentation; mock data stays in this example. */
function WarehouseViewport() {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<WarehouseScenario>('dispatch');
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const snapshot = SCENARIOS[scenario], selection = exampleSelectionNodeId(scene), metrics = warehouseMetrics(snapshot);

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
  const changeScenario = (value: WarehouseScenario) => { applyWarehouseSnapshot(store, SCENARIOS[value]); setScenario(value); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'alerts'} onClick={() => setSidePanel('alerts')}>Alerts</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;

  return <section className="wh-viewport hud-viewport" aria-label="Distribution centre" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Distribution centre navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Warehouse size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 02 / WAREHOUSING</span><h1>{SITE_NAME}</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="wh-snapshot">Mock snapshot</label><select id="wh-snapshot" aria-label="Mock snapshot" value={scenario} onChange={event => changeScenario(event.target.value as WarehouseScenario)}>{(Object.keys(SCENARIO_LABELS) as WarehouseScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.shift} · {metrics.crew} on site</span></div>
        <p className="hud-navigation-note" role="status">{SCENARIO_NOTES[scenario]} Mock data · no WMS, yard or telematics connection.</p>
      </DataPanel>
      <HudMetrics label="Distribution centre metrics" size={metricSize} metrics={warehouseHudMetrics(snapshot, {
        docks: { label: 'Open dock schedule', onActivate: () => toggleLeft('docks'), pressed: leftPanel === 'docks' },
        putaway: { label: 'Open receiving alerts', onActivate: () => toggleSide('alerts'), pressed: sidePanel === 'alerts' },
        loads: { label: 'Open outbound loads', onActivate: () => toggleLeft('loads'), pressed: leftPanel === 'loads' },
        storage: { label: 'Open storage', onActivate: () => toggleLeft('storage'), pressed: leftPanel === 'storage' },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'alerts' && <DataPanel className="hud-side-panel" label="Distribution centre alerts" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Mock snapshot · no live feed', state: 'unknown' }}>
      <AlertList snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel wh-inspector-panel" label="Distribution centre inspector" density="compact" slots={{ header: sideTabs }}><HudNodePreview nodeId={previewNodeFor(snapshot, selection)} />{inspectorFor(snapshot, selection)}</DataPanel>}

    {panelsVisible && leftPanel === 'docks' && <DataPanel className="hud-floating-panel wh-wide-panel" title="Docks & yard" label="Docks" description={`${metrics.occupied} of ${metrics.doors} doors in use · D01–D08 receiving, D09–D16 dispatch`} density="compact" slots={{ icon: <Truck size={16} />, actions: closeLeft }}>
      <DockTable snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'loads' && <DataPanel className="hud-floating-panel wh-wide-panel" title="Outbound loads" label="Loads" description={`${metrics.open} open · ${metrics.atRisk} at risk`} density="compact" slots={{ icon: <PackageCheck size={16} />, actions: closeLeft }}>
      <LoadTable snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'storage' && <DataPanel className="hud-floating-panel" title="Storage" label="Storage" description={`${metrics.used} of ${metrics.capacity} pallet positions used · ${metrics.utilisation} %`} density="compact" slots={{ icon: <Boxes size={16} />, actions: closeLeft }}>
      <StorageChips snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'fleet' && <DataPanel className="hud-floating-panel" title="Fleet" label="Fleet" description={`${snapshot.fleet.filter(value => value.status === 'working').length} of ${snapshot.fleet.length} vehicles working`} density="compact" slots={{ icon: <Forklift size={16} />, actions: closeLeft }}>
      <FleetList snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel wh-about" title="Distribution centre" label="Distribution centre information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">A regional distribution centre laid out like many real ones: one dock front in a U-flow, with receiving doors on the west and dispatch doors on the east, so trucks share one yard and the fast movers stay close to the docks. Behind the cross aisle stand seven reserve aisles whose ground level is the case-pick face, a chilled chamber, a hazardous goods cage, bulk storage, an each-pick module with carton flow racks, robot sortation to put walls and pack benches on a conveyor. Outside: a gatehouse, eight yard stalls, a container drop area, staff parking and a sprinkler tank.</p>
      <p className="hud-concept-note">Every rack bay, dock lane and roll cage draws its exact count; lanes show up to ten pallets and people are drawn up to a bounded number while the panels keep the exact totals. Vehicles, pickers and the yard truck follow fixed demonstration loops. Nothing here is connected to a real warehouse, and every model comes from the shared catalog.</p>
      <WarehouseLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'docks' && panelsVisible} onClick={() => toggleLeft('docks')}><Truck size={14} />Docks</button><button type="button" aria-pressed={leftPanel === 'loads' && panelsVisible} onClick={() => toggleLeft('loads')}><PackageCheck size={14} />Loads</button><button type="button" aria-pressed={leftPanel === 'storage' && panelsVisible} onClick={() => toggleLeft('storage')}><Boxes size={14} />Storage</button><button type="button" aria-pressed={leftPanel === 'fleet' && panelsVisible} onClick={() => toggleLeft('fleet')}><Forklift size={14} />Fleet</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'alerts' && panelsVisible} onClick={() => toggleSide('alerts')}><AlertTriangle size={14} />Alerts</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Distribution centre motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select a door, truck, aisle sign, rack bay, vehicle or pin</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function WarehouseDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  useEffect(() => { const session = createWarehouseStore(); setStore(session); return () => session.dispose(); }, []);
  return <main className="hud-page warehouse-page"><SiteHeader />{store ? <DashboardProvider store={store}><WarehouseViewport /></DashboardProvider> : <p className="wh-preparing">Preparing distribution centre…</p>}</main>;
}
