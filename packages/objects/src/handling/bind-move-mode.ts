import type { PickTarget, SceneRenderer } from '@opsorama/three';
import type { MoveMode } from './move-mode';
import type { ResolvedTarget } from './state';

/** The renderer's pick box for a move target: the unit's turned footprint and height at the resolved place. */
export function moveTargetPick({ placement, size }: ResolvedTarget): PickTarget {
  return { node: placement.container, ...(placement.anchor ? { anchor: placement.anchor } : {}), offset: placement.offset, size: [size.footprint[0], size.height, size.footprint[1]] };
}

/**
 * Keep a renderer's pick targets in step with move mode: one box per target of the snapshot, and a click on one becomes
 * `mode.request`. Returns the function that stops it and clears the boxes. Uses only types from `@opsorama/three`, so
 * this module adds no renderer code to a bundle.
 */
export function bindMoveMode(renderer: Pick<SceneRenderer, 'setPickTargets'>, mode: MoveMode): () => void {
  const show = () => {
    const { unit, targets } = mode.getSnapshot();
    renderer.setPickTargets(unit === null ? null : targets.map(moveTargetPick), (_, index) => mode.request(targets[index]));
  };
  show();
  const stop = mode.subscribe(show);
  return () => { stop(); renderer.setPickTargets(null); };
}
