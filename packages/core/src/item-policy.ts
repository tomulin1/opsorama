import type { Vec3 } from './index';
import type { CarryRule } from './carry';

/**
 * Item policy: an optional rule set that owns where items are and checks every pick-up and put-down of the behavior
 * runner (`BehaviorRunnerOptions.itemPolicy`). Without a policy the runner keeps items as plain placements with no
 * compatibility check. A policy decides physical fit only; records, business rules and commands stay with the host.
 * `handlingItemPolicy` in `@opsorama/objects/handling` implements it with the catalog's handling declarations.
 */

/** Why a policy refused a change: a policy-defined `code` (for example `does-not-fit`) and a message that names the problem and the fix. */
export interface ItemViolation { code: string; message: string; }

/** Result of a policy check: allowed, or refused with at least one violation. */
export type ItemCheck = { ok: true } | { ok: false; violations: readonly ItemViolation[] };

/**
 * A named place on an object that an item policy resolves and checks, used by `InteractDetails.putOn`. `receptacle`
 * names the place on the interaction's node. A policy can accept more fields; a model package declares them by
 * augmenting this interface (`declare module '@opsorama/core' { interface ItemPlace { ... } }`), as
 * `@opsorama/objects/handling` does for a receptacle's position, layer, load pattern and turn.
 */
export interface ItemPlace { receptacle: string; }

/** Where an item rests under a policy: on a node (a carrying agent's node included) at an optional anchor plus a local `offset` and heading in radians, or in the world. */
export type ItemPolicyPlacement =
  | { node: string; anchor?: string; offset: Vec3; yaw?: number }
  | { position: Vec3; yaw: number };

/** Where a put-down goes: a named place of `node`, or the floor at a world position and heading in radians. */
export type ItemDestination = { node: string; place: ItemPlace } | { position: Vec3; yaw: number };

/** One pick-up and put-down at an interaction, applied by `ItemPolicy.exchange`. */
export interface ItemExchange {
  /** The agent, as passed to `addCarrier`. */
  agent: string;
  /** Carried items to put down, top of the agent's stack first, all at `to`. */
  putDown: readonly string[];
  /** Where `putDown` goes; present whenever `putDown` is not empty. */
  to?: ItemDestination;
  /** Items to take into the agent's hold, in order, after the put-down. */
  pickUp: readonly string[];
}

export interface ItemPolicy {
  /**
   * How hosts place, move and remove items under this policy, for the runner's error messages, e.g. `place units with
   * handling.move and remove them with handling.unregister`. With a policy the runner's `items`, `placeItem` and
   * `removeItem` are not used.
   */
  readonly itemChanges: string;
  /**
   * Prepare an agent with a carry rule. The runner calls it once per such agent when it is created and throws with the
   * violation's message when the policy refuses, e.g. when the agent's model has no place at `rule.anchor`.
   */
  addCarrier(agent: string, rule: CarryRule): ItemCheck;
  /** Every item and where it rests, oldest arrival first. Items an agent holds rest on the agent's node. */
  placements(): ReadonlyMap<string, ItemPolicyPlacement>;
  /** Items an agent holds, bottom first. */
  carried(agent: string): readonly string[];
  /**
   * Check and apply a put-down followed by a pick-up, all or nothing: on a refusal nothing changes. The runner calls it
   * once for the items a step names, then once per item when it picks up a count of items from an object.
   */
  exchange(request: ItemExchange): ItemCheck;
  /** Called after items change, also by the host between runner ticks. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
