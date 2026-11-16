import type { SceneNode, SceneSettings, Vec3 } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { CARRY_AHEAD, serviceLoop, serviceNodes, type RestaurantSnapshot } from './model';
import { standingPoint, trackServicePhase } from './service';

/** How often the loop advances and reads where the renderer draws its people; plate hand-overs last 0.8 s. */
const POLL_MS = 100;
/** Longest gap the loop catches up on in one poll, so a stalled tab does not run ahead of the renderer. */
const MAX_STEP = .25;
/** Scene identity of a loop node; a walker's route `elapsed` only matters to a renderer that mounts later. */
const identity = (node: SceneNode) => JSON.stringify({ ...node, route: undefined });

export interface ServiceLoopOptions {
  /** One of the mock snapshots in `SCENARIOS`; other snapshots have no loop and the function does nothing. */
  snapshot: RestaurantSnapshot;
  /** The renderer that draws the scene, or null before it is ready. */
  renderer(): SceneRenderer | null;
  /** The scene clock: pause, motion and speed apply to the loop as to the renderer's routes. */
  clock(): Pick<SceneSettings, 'paused' | 'motion' | 'speed'>;
  /**
   * Places the loop's nodes in the host scene, e.g. into a district with `placeSceneNodes`. It may prefix IDs (give the
   * same prefix as `idPrefix`) and translate by `offset`, nothing else. Default: unchanged.
   */
  place?(nodes: readonly SceneNode[]): SceneNode[];
  idPrefix?: string;
  offset?: Vec3;
  /**
   * Receives the loop's placed nodes whenever a person changes pose or a plate moves: all of them (`nodes`), the ones
   * to upsert (`changed`) and the IDs of plates that left the scene into the dish machine (`removed`).
   */
  onChange(update: { nodes: SceneNode[]; changed: SceneNode[]; removed: string[] }): void;
}

/**
 * Runs the restaurant's service loop until the returned function is called. The scene must start with the loop's
 * nodes at phase 0 (`restaurantNodes(snapshot)` or `serviceNodes(snapshot, 0)`). The loop advances its phase with the
 * scene clock and keeps it in step with where the renderer draws the walking cooks and servers, through pauses, motion
 * settings, hidden tabs and remounts; then it reports what changed.
 */
export function runServiceLoop({ snapshot, renderer, clock, place = nodes => [...nodes], idPrefix = '', offset = [0, 0, 0], onChange }: ServiceLoopOptions): () => void {
  const loop = serviceLoop(snapshot);
  if (!loop) return () => {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown = new Map(place(serviceNodes(snapshot, 0)).map(node => [node.id, identity(node)])), phase = 0, last = performance.now();
  const timer = window.setInterval(() => {
    const now = performance.now(), seconds = Math.min(MAX_STEP, (now - last) / 1000), view = renderer();
    last = now;
    if (!view) return;
    const diagnostics = view.getDiagnostics();
    if (diagnostics.disposed || !diagnostics.loaded) return;
    const { paused, motion, speed } = clock();
    if (!paused && motion && !reducedMotion.matches && !document.hidden) phase = (phase + seconds * speed) % loop.cycle.period;
    phase = trackServicePhase(loop.cycle, id => {
      const anchor = view.getAnchor(`${idPrefix}${id}`, 'carry');
      if (!anchor) return null;
      const [x, z] = standingPoint(anchor, CARRY_AHEAD);
      return [x - offset[0], z - offset[2]];
    }, phase);
    const nodes = place(serviceNodes(snapshot, phase)), next = new Map(nodes.map(node => [node.id, identity(node)]));
    const changed = nodes.filter(node => shown.get(node.id) !== next.get(node.id)), removed = [...shown.keys()].filter(id => !next.has(id));
    shown = next;
    if (changed.length || removed.length) onChange({ nodes, changed, removed });
  }, POLL_MS);
  return () => window.clearInterval(timer);
}
