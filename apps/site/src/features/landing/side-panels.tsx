'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useScene, useSceneRenderer, useSceneStore } from '@opsorama/react';
import { exampleSelectionNodeId } from '../example-selection';
import { HudNodePreview } from '../example-hud';
import { EcommerceSidePanel, type EcommerceSidePanelId } from '../ecommerce/components';
import type { AreaId, EcommerceSnapshot, Order } from '../ecommerce/model';
import { orderNodeId } from '../ecommerce/scene';
import { DatacenterSidePanel, type DatacenterSidePanelId } from '../datacenter/side-panel';
import { WarehouseSidePanel, type WarehouseSidePanelId } from '../warehouse/components';
import type { WarehouseSnapshot } from '../warehouse/model';

/**
 * The examples' right-hand panels on the home page. Each adapter renders the example's own side panel component with
 * the home page's panel state; the panels behave as in the examples, but nothing in them leaves the home page.
 */
export interface SidePanelState {
  /** The open panel, such as `inspector`, `alerts` or `areas`. */
  panel: string;
  onPanel(panel: string | null): void;
}

/** What a scene's right panel needs: its renderer, and the metric panels that open it, as in the example. */
export interface SceneSide {
  render(state: SidePanelState): ReactNode;
  /** Metric ids whose panels open the right panel in the example: the panel they open, or the node whose inspector they open. */
  metrics: Readonly<Record<string, { label: string; panel: string } | { label: string; inspect: string }>>;
}

/** Selects a node as an example list does, which opens its inspector. */
function useSelect(onPanel: (panel: string) => void) {
  const store = useSceneStore();
  return (nodeId: string) => { store.select(nodeId, 'keyboard'); onPanel('inspector'); };
}

function ShopSide({ panel, onPanel, records }: SidePanelState & { records: () => EcommerceSnapshot }) {
  const scene = useScene(), renderer = useSceneRenderer(), store = useSceneStore(), snapshot = records();
  const [orderId, setOrderId] = useState<string | null>(null), [areaFilter, setAreaFilter] = useState<AreaId | null>(null);
  const select = useSelect(onPanel), order = orderId ? snapshot.orders.find(value => value.id === orderId) : undefined;
  // Picking something in the scene replaces the order shown in the inspector.
  useEffect(() => { if (scene.selection?.origin === 'pointer') setOrderId(null); }, [scene.selection]);
  const inspectOrder = (value: string) => { const found = snapshot.orders.find(item => item.id === value); if (!found) return; store.select(orderNodeId(snapshot, found), 'keyboard'); setOrderId(value); onPanel('inspector'); };
  const locate = (value: Order) => { if (renderer && !renderer.getDiagnostics().disposed) renderer.frame(orderNodeId(snapshot, value)); };
  const selectArea = (value: AreaId) => { const next = areaFilter === value ? null : value; setAreaFilter(next); if (next) { setOrderId(null); select(`area:${next}`); } };
  return <EcommerceSidePanel snapshot={snapshot} panel={panel as EcommerceSidePanelId} selection={scene.selection?.nodeId ?? null} previewNodeId={exampleSelectionNodeId(scene)} order={order} areaFilter={areaFilter}
    onPanel={onPanel} onSelectArea={selectArea} onInspectOrder={inspectOrder} onLocate={locate} />;
}

function WarehouseSide({ panel, onPanel, snapshot }: SidePanelState & { snapshot: WarehouseSnapshot }) {
  const scene = useScene(), select = useSelect(onPanel);
  return <WarehouseSidePanel snapshot={snapshot} panel={panel as WarehouseSidePanelId} selection={exampleSelectionNodeId(scene)} onPanel={onPanel} onSelect={select} />;
}

function DatacenterSide({ panel, onPanel }: SidePanelState) {
  const selected = useScene().selection?.nodeId ?? null, select = useSelect(onPanel);
  return <DatacenterSidePanel scenario="incident" panel={panel as DatacenterSidePanelId} selected={selected} preview={<HudNodePreview nodeId={selected} />} onPanel={onPanel} onSelect={select} />;
}

/** The shop's areas and inspector; the shoppers panel opens the areas, as in the example. */
export const shopSide = (records: () => EcommerceSnapshot): SceneSide => ({
  render: state => <ShopSide {...state} records={records} />,
  metrics: { shoppers: { label: 'Open process areas', panel: 'areas' } },
});
/** The distribution centre's alerts and inspector; the putaway panel opens the receiving alerts, as in the example. */
export const warehouseSide = (snapshot: WarehouseSnapshot): SceneSide => ({
  render: state => <WarehouseSide {...state} snapshot={snapshot} />,
  metrics: { putaway: { label: 'Open receiving alerts', panel: 'alerts' } },
});
/** The datacenter's incident queue and inspector; the inlet panel inspects the hottest rack and the alerts panel opens the queue. */
export const datacenterSide = (peakRack: string): SceneSide => ({
  render: state => <DatacenterSide {...state} />,
  metrics: { inlet: { label: 'Inspect the rack with the peak inlet', inspect: peakRack }, alerts: { label: 'Open alert queue', panel: 'alerts' } },
});
