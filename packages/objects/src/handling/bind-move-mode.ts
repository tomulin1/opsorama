import type { PickTarget, SceneRenderer } from '@opsorama/three';
import type { MoveMode } from './move-mode';
import type { ResolvedTarget } from './state';

/**
 * The renderer's pick target for a move target: the unit's turned footprint and height at the resolved place. With `unit`,
 * the target shows a translucent copy of that unit, turned as it would stand there, instead of a box.
 */
export function moveTargetPick({ placement, size }: ResolvedTarget, unit?: string): PickTarget {
  return {
    node: placement.container, ...(placement.anchor ? { anchor: placement.anchor } : {}), offset: placement.offset, size: [size.footprint[0], size.height, size.footprint[1]],
    // Only a string names the unit, so `targets.map(moveTargetPick)`, which passes indexes, still gets boxes.
    ...(typeof unit === 'string' ? { ghost: unit, yaw: placement.turn * Math.PI / 180 } : {}),
  };
}

export interface BindMoveModeOptions {
  /** Show each target as a ghost of the unit (true) or as a box (false). Default true. */
  ghost?: boolean;
}

/**
 * Keep a renderer's pick targets in step with move mode: a ghost of the unit (or a box) at each target of the snapshot, and
 * a click on one becomes `mode.request`. Returns the function that stops it and clears the targets. Uses only types from
 * `@opsorama/three`, so this module adds no renderer code to a bundle.
 */
export function bindMoveMode(renderer: Pick<SceneRenderer, 'setPickTargets'>, mode: MoveMode, options: BindMoveModeOptions = {}): () => void {
  const ghost = options.ghost ?? true;
  const show = () => {
    const { unit, targets } = mode.getSnapshot();
    renderer.setPickTargets(unit === null ? null : targets.map(target => moveTargetPick(target, ghost ? unit : undefined)), (_, index) => mode.request(targets[index]));
  };
  show();
  const stop = mode.subscribe(show);
  return () => { stop(); renderer.setPickTargets(null); };
}
