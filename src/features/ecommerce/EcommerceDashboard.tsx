'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Boxes, ClipboardList, Crosshair, Eye, EyeOff, Info, LayoutGrid, Maximize2, Minimize2, Palette, Pause, Play, Truck, X, Store } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { AREAS, area, orderArea, type AreaId, type CarrierId, type CheckoutId, type DepartmentId, type DockId, type EcommerceScenario, type LocationId, type PackStationId, type PutWallId } from './model';
import { runFeedLoop } from './feed-loop';
import { DEFAULT_ZOOM, ecommerceControllers, orderNodeId } from './scene';
import { createEcommerceSimulation, createEcommerceStore, type EcommerceSimulation } from './simulation';
import {
  ActivityList, AgentInspector, AreaInspector, AreaList, CarrierInspector, CheckoutInspector, CollectInspector, DepartmentInspector, DockInspector, DockPanel, EcommerceLibrary, EmptyInspector, ecommerceHudMetrics,
  LocationInspector, OrderInspector, OrderTable, PackInspector, PutWallInspector, ReturnsInspector, StageLegend, StockPanel, TaskList, UnitInspector,
} from './components';
import '@opsorama/ui/styles.css';

const SCENARIO_LABELS: Readonly<Record<EcommerceScenario, string>> = { peak: 'Monday morning peak', steady: 'Wednesday afternoon', night: 'Sunday night shift' };
const SCENARIO_NOTES: Readonly<Record<EcommerceScenario, string>> = {
  peak: 'SwiftPost cut-off in 50 minutes, a short pick in F3 and a late inbound truck.',
  steady: 'Parcelo collects at 16:00; the shop runs two lanes.',
  night: 'Shop closed; the reach truck replenishes and a delivery waits for put-away.',
};
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'orders' | 'stock' | 'docks' | 'about';
type SidePanel = 'areas' | 'inspector';

/** Host-owned HUD over one React scene. Shared panels own presentation; the mock feed and commands stay in this example. */
function EcommerceViewport({ simulation }: { simulation: { current: EcommerceSimulation } }) {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<EcommerceScenario>('peak'), [snapshot, setSnapshot] = useState(() => simulation.current.snapshot());
  const [areaFilter, setAreaFilter] = useState<AreaId | null>(null), [orderId, setOrderId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const selection = scene.selection?.nodeId ?? null;
  const [kind, id = ''] = (selection ?? '').split(':') as [string, string | undefined];
  const order = orderId ? snapshot.orders.find(value => value.id === orderId) : undefined;
  const orders = areaFilter ? snapshot.orders.filter(value => orderArea(value) === areaFilter) : snapshot.orders;

  // The scene clock drives the feed: pause and speed apply to both, and motion-off keeps the records running without travel.
  useEffect(() => runFeedLoop({ feed: () => simulation.current, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords: setSnapshot }), [store, simulation]);

  // A selection from the scene or a list opens the inspector; narrow layouts close the left panel that would cover it.
  const openInspector = useCallback(() => {
    setSidePanel('inspector'); setPanelsVisible(true);
    if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null);
  }, []);
  useEffect(() => { if (selection) openInspector(); }, [selection, openInspector]);
  // Picking something in the scene replaces the order shown in the inspector.
  useEffect(() => { if (scene.selection?.origin === 'pointer') setOrderId(null); }, [scene.selection]);
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);

  // Re-selecting the current node does not change the selection, so list clicks open the inspector directly.
  const select = (nodeId: string) => { setOrderId(null); store.select(nodeId, 'keyboard'); openInspector(); };
  const inspectOrder = (value: string) => { const found = snapshot.orders.find(item => item.id === value); if (!found) return; store.select(orderNodeId(snapshot, found), 'keyboard'); setOrderId(value); openInspector(); };
  // An area filters the order table and opens its inspector; choosing it again clears the filter.
  const selectArea = (value: AreaId) => { const next = areaFilter === value ? null : value; setAreaFilter(next); if (next) select(`area:${next}`); };
  const overview = () => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.overview(); store.select(null); setOrderId(null); };
  const changeScenario = (value: EcommerceScenario) => { simulation.current.dispose(); simulation.current = createEcommerceSimulation(value); store.replace(simulation.current.nodes()); setSnapshot(simulation.current.snapshot()); setScenario(value); setOrderId(null); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'areas'} onClick={() => setSidePanel('areas')}>Areas</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;

  // An open order stays in the inspector while it moves from one place to the next.
  const inspector = order ? <OrderInspector order={order} snapshot={snapshot} onLocate={() => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.frame(orderNodeId(snapshot, order)); }} />
    : kind === 'area' || kind === 'pin' ? <AreaInspector id={id as AreaId} snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'qa' ? <AreaInspector id="receiving" snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'rack' || kind === 'flow' || kind === 'shelf' ? <LocationInspector id={id as LocationId} snapshot={snapshot} />
    : kind === 'dock' ? <DockInspector id={id as DockId} snapshot={snapshot} />
    : kind === 'pack' ? <PackInspector id={id as PackStationId} snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'putwall' ? <PutWallInspector id={id as PutWallId} snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'cage' ? <CarrierInspector id={id.split('-')[0] as CarrierId} snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'wrapper' ? <CarrierInspector id="freight" snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'checkout' ? <CheckoutInspector id={id as CheckoutId} snapshot={snapshot} />
    : kind === 'collect' ? <CollectInspector snapshot={snapshot} onInspect={inspectOrder} />
    : kind === 'returns' ? <ReturnsInspector snapshot={snapshot} />
    : kind === 'gondola' ? <DepartmentInspector id={id as DepartmentId} snapshot={snapshot} onInspect={inspectOrder} />
    : selection && snapshot.units.some(unit => unit.id === selection) ? <UnitInspector id={selection} snapshot={snapshot} onInspect={inspectOrder} />
    : selection && /^(forklift|reach-truck|replenisher|dispatcher|shelf-filler|picker|sorter)/.test(selection) ? <AgentInspector id={selection} snapshot={snapshot} />
    : <EmptyInspector />;

  return <section className="ec-viewport hud-viewport" aria-label="Online shop and fulfilment centre" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Shop and warehouse navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Store size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 01 / E-COMMERCE</span><h1>Online shop &amp; fulfilment centre</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="ec-snapshot">Starting scenario</label><select id="ec-snapshot" aria-label="Starting scenario" value={scenario} onChange={event => changeScenario(event.target.value as EcommerceScenario)}>{(Object.keys(SCENARIO_LABELS) as EcommerceScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.day} · shop {snapshot.shopOpen ? 'open' : 'closed'}</span></div>
        <p className="hud-navigation-note" role="status">{SCENARIO_NOTES[scenario]} Simulated feed · no shop, WMS or carrier connection.</p>
      </DataPanel>
      <HudMetrics label="Operations metrics" size={metricSize} metrics={ecommerceHudMetrics(snapshot, {
        orders: { label: 'Open order list', onActivate: () => toggleLeft('orders'), pressed: leftPanel === 'orders' },
        cutoff: { label: 'Open docks and carrier cut-offs', onActivate: () => toggleLeft('docks'), pressed: leftPanel === 'docks' },
        stock: { label: 'Open stock alerts', onActivate: () => toggleLeft('stock'), pressed: leftPanel === 'stock' },
        shoppers: { label: 'Open process areas', onActivate: () => toggleSide('areas'), pressed: sidePanel === 'areas' },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'areas' && <DataPanel className="hud-side-panel" label="Process areas panel" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Simulated feed · no live connection', state: 'unknown' }}>
      <AreaList snapshot={snapshot} selected={areaFilter} onSelect={selectArea} />
      <TaskList snapshot={snapshot} />
      <ActivityList snapshot={snapshot} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel ec-inspector-panel" label="Shop and warehouse inspector" density="compact" slots={{ header: sideTabs }}>{inspector}</DataPanel>}

    {panelsVisible && leftPanel === 'orders' && <DataPanel className="hud-floating-panel ec-orders-panel" title="Open orders" label="Open orders" description={`${orders.length} of ${snapshot.orders.length} open${areaFilter ? ` · ${area(areaFilter).label}` : ''} · ${snapshot.ordersToday} placed today`} density="compact" slots={{ icon: <ClipboardList size={16} />, actions: closeLeft, footer: areaFilter ? <button type="button" className="hud-text-button" onClick={() => setAreaFilter(null)}>Clear area filter</button> : undefined }}>
      <OrderTable snapshot={snapshot} orders={orders} onInspect={inspectOrder} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'stock' && <DataPanel className="hud-floating-panel ec-stock-panel" title="Stock & locations" label="Stock and locations" description={`${snapshot.alerts.length} SKU alerts · ${AREAS.length} areas · reserve and forward pick`} density="compact" slots={{ icon: <Boxes size={16} />, actions: closeLeft }}>
      <StockPanel snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'docks' && <DataPanel className="hud-floating-panel ec-docks-panel" title="Docks & carriers" label="Docks and carriers" description="Inbound deliveries, outbound collections and cut-offs" density="compact" slots={{ icon: <Truck size={16} />, actions: closeLeft }}>
      <DockPanel snapshot={snapshot} onSelect={select} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel ec-about" title="Shop & warehouse" label="Shop and warehouse information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">A shop with checkouts and click &amp; collect next to the warehouse that fulfils its online orders: receiving, reserve storage, forward picking, sortation, packing, dispatch and returns. A seeded mock feed keeps the site moving: every pallet, tote, parcel, shopping bag and roll cage is one object that really changes place, and stock, orders and sales change when it arrives. The forklift unloads trucks, the reach truck puts pallets away and replenishes the pick faces, pickers and robots carry orders to packing and dispatch, and shoppers take goods from the shelves to the checkout. Every model comes from the shared catalog.</p>
      <StageLegend />
      <EcommerceLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'orders' && panelsVisible} onClick={() => toggleLeft('orders')}><ClipboardList size={14} />Orders</button><button type="button" aria-pressed={leftPanel === 'stock' && panelsVisible} onClick={() => toggleLeft('stock')}><Boxes size={14} />Stock</button><button type="button" aria-pressed={leftPanel === 'docks' && panelsVisible} onClick={() => toggleLeft('docks')}><Truck size={14} />Docks</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'areas' && panelsVisible} onClick={() => toggleSide('areas')}><LayoutGrid size={14} />Areas</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" aria-pressed={scene.settings.paused} aria-label={scene.settings.paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => store.configure({ paused: !scene.settings.paused })}>{scene.settings.paused ? <Play size={14} /> : <Pause size={14} />}{scene.settings.paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Shop and warehouse motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select an area, rack, dock or bench</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function EcommerceDashboard() {
  const [session, setSession] = useState<{ store: SceneStore; simulation: { current: EcommerceSimulation } } | null>(null);
  // The session owns the store and the feed; changing the scenario swaps the feed inside the same holder.
  useEffect(() => {
    const simulation = { current: createEcommerceSimulation('peak') }, store = createEcommerceStore('peak', simulation.current);
    setSession({ store, simulation });
    return () => { simulation.current.dispose(); store.dispose(); };
  }, []);
  return <main className="hud-page ecommerce-page"><SiteHeader />{session ? <DashboardProvider store={session.store}><EcommerceViewport simulation={session.simulation} /></DashboardProvider> : <p className="ec-preparing">Preparing shop and warehouse dashboard…</p>}</main>;
}
