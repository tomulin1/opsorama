import { createSceneStore, type SceneStore } from '@opsorama/core';
import type { MetricAction } from '@opsorama/react/ui';
import { makeDatacenterStore } from '../../../examples/datacenter-data';
import type { HudMetric } from '../example-hud';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { ecommerceHudMetrics } from '../ecommerce/components';
import type { EcommerceSnapshot } from '../ecommerce/model';
import { DEFAULT_ZOOM as SHOP_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import { createEcommerceSimulation, createEcommerceStore } from '../ecommerce/simulation';
import { cutoffHudMetrics, type ShiftMetricsView } from '../cutoff/metrics';
import { createShiftGame } from '../cutoff/rules';
import { lightingAt, playNodes } from '../cutoff/scene';
import { datacenterHudMetrics } from '../datacenter/metrics';
import { warehouseHudMetrics } from '../warehouse/components';
import { SCENARIOS as WAREHOUSE } from '../warehouse/model';
import { DEFAULT_ZOOM as WAREHOUSE_ZOOM, createWarehouseStore } from '../warehouse/scene';
import { createAgentBuild, type AgentLog } from './agent-build';

/**
 * The scenes behind the home page carousel. Each one is a domain example's own scene and feed, created when its slide
 * is shown and disposed when another scene takes its place, so the home page never copies example code.
 */
export type LandingSceneId = 'shop' | 'warehouse' | 'datacenter' | 'cutoff' | 'office';

/**
 * The example's top panels over its scene, built by the example's own metric function from the scene's latest records.
 * They only show values: the home page has none of the example's detail panels, and a click must not take the visitor
 * away from it, so the panels carry no actions.
 */
export interface SceneMetrics {
  label: string;
  /** Panels in the dark variant, as the game shows them; the dashboards' panels stay light on the home page. */
  dark?: boolean;
  subscribe(listener: () => void): () => void;
  /** Bumped whenever the records change, for `useSyncExternalStore`. */
  version(): number;
  read(): readonly HudMetric[];
}

export interface LandingScene {
  store: SceneStore;
  /** The example's default zoom, for the zoom controls' reset. */
  zoom: number;
  controllers?: typeof ecommerceControllers;
  /** The coding agent's log, for the scene an agent builds before the visitor's eyes. */
  log?: AgentLog;
  metrics?: SceneMetrics;
  /** Starts the scene's feed on its store; returns the stop function. */
  run?(): () => void;
  dispose(): void;
}

/** Records that change over time, with the `version` and `subscribe` the panels read them by. */
function liveRecords<T>(initial: T) {
  let value = initial, version = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) { value = next; version++; listeners.forEach(listener => listener()); },
    version: () => version,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
/** Panels from records that never change. */
const fixedMetrics = (label: string, read: SceneMetrics['read']): SceneMetrics => ({ label, read, version: () => 0, subscribe: () => () => {} });
/** The example's metric functions take an action per panel; the home page passes none to use and drops them. */
const NO_ACTION: MetricAction = { label: '', onActivate: () => {} };
const noActions = <K extends string>(ids: readonly K[]) => Object.fromEntries(ids.map(id => [id, NO_ACTION])) as Record<K, MetricAction>;
const displayOnly = (metrics: readonly HudMetric[]): readonly HudMetric[] => metrics.map(metric => ({ ...metric, action: undefined }));

/** The scene's feed drives the store at the scene clock, so pause and speed apply to both. */
function feedStore<S>(store: SceneStore, feed: LoopFeed<S>, onRecords: (records: S) => void = () => {}) {
  return runFeedLoop({ feed: () => feed, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords });
}

/** The shop and warehouse example at its Monday morning peak. */
function shopScene(): LandingScene {
  const simulation = createEcommerceSimulation('peak'), store = createEcommerceStore('peak', simulation);
  const records = liveRecords<EcommerceSnapshot>(simulation.snapshot());
  const metrics: SceneMetrics = { label: 'Operations metrics', subscribe: records.subscribe, version: records.version, read: () => displayOnly(ecommerceHudMetrics(records.get(), noActions(['orders', 'cutoff', 'stock', 'shoppers']))) };
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, metrics, run: () => feedStore(store, simulation, records.set), dispose: () => { store.dispose(); simulation.dispose(); } };
}

/** The distribution centre example's dispatch snapshot. */
function warehouseScene(): LandingScene {
  const store = createWarehouseStore('dispatch');
  const metrics = fixedMetrics('Distribution centre metrics', () => displayOnly(warehouseHudMetrics(WAREHOUSE.dispatch, noActions(['docks', 'putaway', 'loads', 'storage']))));
  return { store, zoom: WAREHOUSE_ZOOM, metrics, dispose: () => store.dispose() };
}

/** The datacenter example's incident snapshot. */
function datacenterScene(): LandingScene {
  const store = makeDatacenterStore();
  const metrics = fixedMetrics('Facility metrics', () => displayOnly(datacenterHudMetrics('incident', noActions(['cpu', 'load', 'inlet', 'alerts']))));
  return { store, zoom: store.getSnapshot().settings.zoom, metrics, dispose: () => store.dispose() };
}

/** Cut-off's Quiet Tuesday shift, whose crew works by itself, with the light following the shift clock. */
function cutoffScene(): LandingScene {
  const game = createShiftGame({ scenario: 'steady', seed: 1 });
  const store = createSceneStore({ schemaVersion: 1, nodes: playNodes(game, []) }, { zoom: SHOP_ZOOM, lighting: lightingAt(game.clock) });
  const view = (): ShiftMetricsView => ({ snapshot: game.snapshot(), score: game.score(), channels: game.channels(), carriers: game.carriers(), bike: game.bike() });
  const records = liveRecords(view());
  const feed: LoopFeed<ShiftMetricsView> = {
    get sceneRevision() { return game.sceneRevision; }, get recordsRevision() { return game.recordsRevision; },
    advance: seconds => game.advance(seconds), nodes: () => playNodes(game, []), snapshot: view,
  };
  const onRecords = (value: ShiftMetricsView) => {
    records.set(value);
    const lighting = lightingAt(game.clock);
    if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting });
  };
  const metrics: SceneMetrics = { label: 'Shift metrics', dark: true, subscribe: records.subscribe, version: records.version, read: () => displayOnly(cutoffHudMetrics(records.get())) };
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, metrics, run: () => feedStore(store, feed, onRecords), dispose: () => { store.dispose(); game.dispose(); } };
}

const FACTORIES: Readonly<Record<LandingSceneId, () => LandingScene>> = { shop: shopScene, warehouse: warehouseScene, datacenter: datacenterScene, cutoff: cutoffScene, office: createAgentBuild };
export function createLandingScene(id: LandingSceneId): LandingScene { return FACTORIES[id](); }
/** Gallery preview of each scene, known before the scene exists. */
export const LANDING_SCENE_PREVIEWS: Readonly<Record<LandingSceneId, string>> = { shop: 'ecommerce', warehouse: 'warehouse', datacenter: 'datacenter', cutoff: 'cutoff', office: 'office' };
