import { createSceneStore, type SceneStore } from '@opsorama/core';
import { makeDatacenterStore } from '../../../examples/datacenter-data';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { DEFAULT_ZOOM as SHOP_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import { createEcommerceSimulation, createEcommerceStore } from '../ecommerce/simulation';
import { createShiftGame } from '../cutoff/rules';
import { lightingAt, playNodes } from '../cutoff/scene';

/**
 * The scenes behind the home page carousel. Each one is a domain example's own scene and feed, created when its slide
 * is shown and disposed when another scene takes its place, so the home page never copies example code.
 */
export type LandingSceneId = 'shop' | 'datacenter' | 'cutoff';

export interface LandingScene {
  store: SceneStore;
  /** The example's default zoom, for the zoom controls' reset. */
  zoom: number;
  controllers?: typeof ecommerceControllers;
  /** Starts the scene's feed on its store; returns the stop function. */
  run?(): () => void;
  dispose(): void;
}

/** The scene's feed drives the store at the scene clock, so pause and speed apply to both. */
function feedStore<S>(store: SceneStore, feed: LoopFeed<S>, onRecords: (records: S) => void = () => {}) {
  return runFeedLoop({ feed: () => feed, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords });
}

/** The shop and warehouse example at its Monday morning peak. */
function shopScene(): LandingScene {
  const simulation = createEcommerceSimulation('peak'), store = createEcommerceStore('peak', simulation);
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, run: () => feedStore(store, simulation), dispose: () => { store.dispose(); simulation.dispose(); } };
}

/** The datacenter example's incident snapshot. */
function datacenterScene(): LandingScene {
  const store = makeDatacenterStore();
  return { store, zoom: store.getSnapshot().settings.zoom, dispose: () => store.dispose() };
}

/** Cut-off's Quiet Tuesday shift, whose crew works by itself, with the light following the shift clock. */
function cutoffScene(): LandingScene {
  const game = createShiftGame({ scenario: 'steady', seed: 1 });
  const store = createSceneStore({ schemaVersion: 1, nodes: playNodes(game, []) }, { zoom: SHOP_ZOOM, lighting: lightingAt(game.clock) });
  const feed: LoopFeed<string> = {
    get sceneRevision() { return game.sceneRevision; }, get recordsRevision() { return game.recordsRevision; },
    advance: seconds => game.advance(seconds), nodes: () => playNodes(game, []), snapshot: () => game.clock,
  };
  const light = (clock: string) => { const lighting = lightingAt(clock); if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting }); };
  return { store, zoom: SHOP_ZOOM, controllers: ecommerceControllers, run: () => feedStore(store, feed, light), dispose: () => { store.dispose(); game.dispose(); } };
}

const FACTORIES: Readonly<Record<LandingSceneId, () => LandingScene>> = { shop: shopScene, datacenter: datacenterScene, cutoff: cutoffScene };
export function createLandingScene(id: LandingSceneId): LandingScene { return FACTORIES[id](); }
/** Gallery preview of each scene, known before the scene exists. */
export const LANDING_SCENE_PREVIEWS: Readonly<Record<LandingSceneId, string>> = { shop: 'ecommerce', datacenter: 'datacenter', cutoff: 'cutoff' };
