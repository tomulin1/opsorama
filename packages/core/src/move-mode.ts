import type { HandlingState, MoveCheck, MoveRefusal, ResolvedTarget, UnitPlacement } from './handling-state';

/**
 * Move mode (phase H3 of docs/CONTAINMENT.md): optional interactivity that offers a unit's compatible
 * places and turns a choice into a request. It holds no placements and moves nothing: the host
 * decides what a request means and calls `HandlingState.move`. A scene does not need it to use
 * handling state, and domain dashboards normally leave it out.
 */

/** What the user asked for; `check` is current at request time and refused requests are delivered too. */
export interface MoveRequest { unit: string; target: ResolvedTarget; from?: UnitPlacement; check: MoveCheck; }

export interface MoveModeSnapshot {
  /** The unit being moved, or null when move mode is off. */
  unit: string | null;
  /** Compatible free places, for scene markers and an HTML list. */
  targets: readonly ResolvedTarget[];
  /** Declared places that refuse the unit, with the reason, for an HTML list. */
  refusals: readonly MoveRefusal[];
}

export interface MoveModeOptions {
  handling: HandlingState;
  /** Called for every request. The host runs its command and calls `handling.move`, or refuses. */
  onRequest: (request: MoveRequest) => void;
  /** Limit targets and refusals to these containers. Default: every registered container. */
  containers?: readonly string[];
  /** Sort targets, lowest first; see `HandlingState.targets`. */
  rank?: (target: ResolvedTarget) => number;
  /** Most targets to offer, after `rank`. Default: all of them. */
  limit?: number;
}

export interface MoveMode {
  getSnapshot(): MoveModeSnapshot;
  /** Called after every snapshot change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Start moving a unit, replacing any unit in progress. */
  begin(unit: string): void;
  /** Leave move mode. Does nothing when it is off. */
  cancel(): void;
  /** Ask for a target from the current snapshot. Ignored when move mode is off. */
  request(target: ResolvedTarget): void;
  /** Leave move mode and stop following the handling state. */
  dispose(): void;
}

const OFF: MoveModeSnapshot = Object.freeze({ unit: null, targets: Object.freeze([]), refusals: Object.freeze([]) });

/** Create move mode over a handling state. It follows the state while a unit is in progress. */
export function createMoveMode({ handling, onRequest, containers, rank, limit }: MoveModeOptions): MoveMode {
  const listeners = new Set<() => void>();
  let snapshot = OFF;
  const set = (next: MoveModeSnapshot) => { snapshot = next; for (const listener of [...listeners]) listener(); };
  const compute = (unit: string): MoveModeSnapshot => Object.freeze({
    unit,
    targets: handling.targets(unit, { ...(containers ? { containers } : {}), ...(rank ? { rank } : {}), ...(limit !== undefined ? { limit } : {}) }),
    refusals: handling.refusals(unit, containers ? { containers } : {}),
  });
  const stop = handling.subscribe(() => { if (snapshot.unit !== null) set(compute(snapshot.unit)); });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin(unit) { set(compute(unit)); },
    cancel() { if (snapshot.unit !== null) set(OFF); },
    request(target) {
      const unit = snapshot.unit;
      if (unit === null) return;
      const from = handling.placement(unit);
      onRequest({ unit, target, ...(from ? { from } : {}), check: handling.check(unit, target.target) });
    },
    dispose() { stop(); if (snapshot.unit !== null) set(OFF); listeners.clear(); },
  };
}
