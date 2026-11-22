import type { ItemCheck, ItemPolicy, ItemPolicyPlacement } from '@opsorama/core';
import type { HandlingMove, HandlingState, HandlingTarget, ReceptacleTarget, UnitPlacement } from './state';

declare module '@opsorama/core' {
  /**
   * With `handlingItemPolicy`, a `putOn` place is a receptacle of the interaction's node: `receptacle` names it, and the
   * fields below pick the place in it as in `ReceptacleTarget`. Omitted fields resolve to the next free place.
   */
  interface ItemPlace {
    /** Slot index, stack level, deck pattern position or first rail position; see `ReceptacleTarget.position`. */
    position?: ReceptacleTarget['position'];
    /** Deck load layer, bottom 0. */
    layer?: ReceptacleTarget['layer'];
    /** Deck load pattern ID. */
    pattern?: ReceptacleTarget['pattern'];
    /** Deck position by [x, z] metres from the deck origin, for layers no pattern covers. */
    free?: ReceptacleTarget['free'];
    /** Quarter turn about y in degrees. */
    turn?: ReceptacleTarget['turn'];
  }
}

const OK: ItemCheck = Object.freeze({ ok: true });

/** A unit placement as an item placement of the behavior runner: a receptacle turn becomes a heading in radians. */
function itemPlacement(at: UnitPlacement): ItemPolicyPlacement {
  if (!('container' in at)) return { position: at.position, yaw: at.yaw };
  return { node: at.container, ...(at.anchor ? { anchor: at.anchor } : {}), offset: at.offset, ...(at.turn ? { yaw: at.turn * Math.PI / 180 } : {}) };
}

/**
 * The item policy of a handling state, for `createBehaviorRunner({ itemPolicy })`. Every placed unit is then an item of
 * the runner, and pick-ups and put-downs are checked moves: a blocked exchange reports the same codes as
 * `HandlingState.move`. Each agent with a carry rule must be registered in the state, with a receptacle at the rule's
 * anchor; units it holds take the rule's `turn`. Move, add or remove units through the state, also inside the runner's
 * `onItemEvent`.
 */
export function handlingItemPolicy(handling: HandlingState): ItemPolicy {
  /** Where each carrier holds units: its receptacle at the carry anchor, with the rule's turn. */
  const holds = new Map<string, HandlingTarget>();
  const holdOf = (agent: string) => {
    const hold = holds.get(agent);
    if (!hold) throw new Error(`Agent ${agent} is not a carrier of this handling policy; give it a carry rule before creating the runner.`);
    return hold;
  };
  return {
    itemChanges: 'place units with handling.move and remove them with handling.unregister',
    addCarrier(agent, rule) {
      const receptacle = handling.receptacleAt(agent, rule.anchor);
      if (!receptacle) return { ok: false, violations: [{ code: 'unknown-target', message: `handling state has no receptacle at anchor ${rule.anchor}. Register the agent's node and declare one in assetHandling.` }] };
      holds.set(agent, { container: agent, receptacle, ...(rule.turn !== undefined ? { turn: rule.turn } : {}) });
      return OK;
    },
    placements: () => new Map([...handling.placements()].map(([id, at]) => [id, itemPlacement(at)])),
    carried: agent => handling.contents(agent),
    exchange({ agent, putDown, to, pickUp }) {
      if (putDown.length && !to) throw new Error(`Agent ${agent}: a put-down needs a destination.`);
      const target: HandlingTarget | undefined = to && ('node' in to ? { ...to.place, container: to.node } : to);
      const moves: HandlingMove[] = [...putDown.map(unit => ({ unit, to: target! })), ...pickUp.map(unit => ({ unit, to: holdOf(agent) }))];
      if (!moves.length) return OK;
      const checks = handling.move(moves), last = checks[checks.length - 1];
      return last.ok ? OK : { ok: false, violations: last.violations.map(({ code, message }) => ({ code, message })) };
    },
    subscribe: listener => handling.subscribe(() => listener()),
  };
}
