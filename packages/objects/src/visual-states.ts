import type { AssetNode, StateDescriptor, VisualState } from '@opsorama/core';

const HEALTH: readonly VisualState[] = Object.freeze(['normal', 'warning', 'critical', 'inactive']);
const ACTIVITY: readonly VisualState[] = Object.freeze(['normal', 'busy', 'warning', 'critical', 'inactive']);

/**
 * Model-native status capabilities. Missing keys have neutral geometry for every
 * state; host labels, selection and alerts remain independent. Unsupported busy
 * values use the normal model appearance. Catalog controls use this same map.
 */
export const assetVisualStates: Readonly<Record<string, readonly VisualState[]>> = Object.freeze({
  conveyor: HEALTH, gate: HEALTH, 'status-beacon': HEALTH, 'map-pin': HEALTH, 'machine-tool': HEALTH,
  'battery-indicator': ACTIVITY, 'mobile-robot': ACTIVITY, 'ev-charger': ACTIVITY,
});

/** Effective native status only; never changes the host node or its alert metadata. */
export function modelVisualState(node: Pick<AssetNode, 'asset' | 'state'>): VisualState {
  return node.state && assetVisualStates[node.asset]?.includes(node.state) ? node.state : 'normal';
}

/** Neutral model contract; host status remains available in labels or separate markers. */
export function neutralModelStates(what: string): StateDescriptor {
  return { shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'], parts: `The ${what} has no status tint or state-dependent operating behavior.`, alternative: 'Use the host label, HTML record view or a separate status marker.' };
}
