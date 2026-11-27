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
 * Every panel opens the full example with `open`, since the home page has none of the example's detail panels.
 */
export interface SceneMetrics {
  label: string;
  subscribe(listener: () => void): () => void;
  /** Bumped whenever the records change, for `useSyncExternalStore`. */
  version(): number;
  read(open: MetricAction): readonly HudMetric[];
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
/** The same action for every panel of an example. */
const every = <K extends string>(ids: readonly K[], open: MetricAction) => Object.fromEntries(ids.map(id => [id, open])) as Record<K, MetricAction>;

/** The scene's feed drives the store at the scene clock, so pause and speed apply to both. */
function feedStore<S>(store: SceneStore, feed: LoopFeed<S>, onRecords: (records: S) => void = () => {}) {
  return runFeedLoop({ feed: () => feed, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords });
}

/** The shop and warehouse example at its Monday morning peak. */
function shopScene(): LandingScene {
  const simulation = createEcommerceSimulation('peak'), store = createEcommerceStore('peak', simulation);
  const records = liveRecords<EcommerceSnapshot>(simulation.snapshot());
  const metrics: SceneMetrics = { label: 'Operations metrics', subscribe: records.subscribe, version: records.version, read: open => ecommerceHudMetrics(records.get(), every(['orders', 'cutoff', 'stock', 'shoppers'], open)) };
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, metrics, run: () => feedStore(store, simulation, records.set), dispose: () => { store.dispose(); simulation.dispose(); } };
}

/** The distribution centre example's dispatch snapshot. */
function warehouseScene(): LandingScene {
  const store = createWarehouseStore('dispatch');
  const metrics = fixedMetrics('Distribution centre metrics', open => warehouseHudMetrics(WAREHOUSE.dispatch, every(['docks', 'putaway', 'loads', 'storage'], open)));
  return { store, zoom: WAREHOUSE_ZOOM, metrics, dispose: () => store.dispose() };
}

/** The datacenter example's incident snapshot. */
function datacenterScene(): LandingScene {
  const store = makeDatacenterStore();
  const metrics = fixedMetrics('Facility metrics', open => datacenterHudMetrics('incident', every(['cpu', 'load', 'inlet', 'alerts'], open)));
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
  // The game's panels show its state and open nothing.
  const metrics: SceneMetrics = { label: 'Shift metrics', subscribe: records.subscribe, version: records.version, read: () => cutoffHudMetrics(records.get()) };
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, metrics, run: () => feedStore(store, feed, onRecords), dispose: () => { store.dispose(); game.dispose(); } };
}

const FACTORIES: Readonly<Record<LandingSceneId, () => LandingScene>> = { shop: shopScene, warehouse: warehouseScene, datacenter: datacenterScene, cutoff: cutoffScene, office: createAgentBuild };
export function createLandingScene(id: LandingSceneId): LandingScene { return FACTORIES[id](); }
/** Gallery preview of each scene, known before the scene exists. */
export const LANDING_SCENE_PREVIEWS: Readonly<Record<LandingSceneId, string>> = { shop: 'ecommerce', warehouse: 'warehouse', datacenter: 'datacenter', cutoff: 'cutoff', office: 'office' };
/** The example each scene comes from; its panels open it. */
export const LANDING_SCENE_EXAMPLES: Readonly<Record<LandingSceneId, { href: string; name: string }>> = {
  shop: { href: '/examples/ecommerce', name: 'the shop and warehouse example' },
  warehouse: { href: '/examples/warehouse', name: 'the distribution centre example' },
  datacenter: { href: '/examples/datacenter', name: 'the datacenter example' },
  cutoff: { href: '/examples/cutoff', name: 'Cut-off' },
  office: { href: '/examples/office', name: 'the office example' },
};
