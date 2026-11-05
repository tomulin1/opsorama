/**
 * Where the forks of a lift truck are. Host data: a truck never lifts by itself,
 * and the load stays a separate node attached to the model's `load` anchor, so it
 * rises and reaches with the forks.
 */
export interface ForkPose {
  /** Metres above the travel height; negative lowers the forks toward the floor. See `FORK_LIMITS`. */
  height: number;
  /** Metres the mast reaches forward. Default 0. See `FORK_LIMITS`. */
  reach?: number;
}
/** One eased move from the previous pose. */
export interface ForkMove extends ForkPose {
  /** Visual seconds, greater than 0 and at most 60. */
  seconds: number;
}
/**
 * The pose on `AssetNode.forks`, optionally followed by `moves` that run in order
 * on the visual clock from the moment the model is built (speed and pause apply).
 * The last move is the confirmed result: motion-off, reduced motion and
 * `localMotion: false` show it at once. A model rebuilt while moves remain starts
 * them again, so a host replaces the motion with its final pose once they end.
 */
export interface ForkMotion extends ForkPose {
  moves?: readonly ForkMove[];
}

/** Travel limits in metres per asset. Height 0 is the model's default fork height; the lowest value rests the forks on the floor. */
export const FORK_LIMITS: Readonly<Record<string, { minHeight: number; maxHeight: number; maxReach: number }>> = Object.freeze({
  forklift: Object.freeze({ minHeight: -.23, maxHeight: 1.3, maxReach: 0 }),
  'reach-truck': Object.freeze({ minHeight: -.23, maxHeight: 3.4, maxReach: 1 }),
});
export const MAX_FORK_MOVE_SECONDS = 60;

const checkPose = (asset: string, pose: ForkPose, label: string) => {
  const limits = FORK_LIMITS[asset], reach = pose.reach ?? 0;
  if (!Number.isFinite(pose.height) || pose.height < limits.minHeight || pose.height > limits.maxHeight) throw new Error(`${label} height of ${asset} must be from ${limits.minHeight} to ${limits.maxHeight} m.`);
  if (!Number.isFinite(reach) || reach < 0 || reach > limits.maxReach) throw new Error(`${label} reach of ${asset} must be from 0 to ${limits.maxReach} m.`);
};

export function validateForkMotion(asset: string, forks: ForkMotion): void {
  if (!Object.hasOwn(FORK_LIMITS, asset)) throw new Error(`forks is supported only by ${Object.keys(FORK_LIMITS).join(', ')}; remove it from ${asset}.`);
  if (!forks || typeof forks !== 'object') throw new Error('forks must be an object with a height.');
  checkPose(asset, forks, 'Fork');
  if (forks.moves === undefined) return;
  if (!Array.isArray(forks.moves)) throw new Error('forks.moves must be an array.');
  for (const move of forks.moves) {
    checkPose(asset, move, 'Fork move');
    if (!(Number.isFinite(move.seconds) && move.seconds > 0 && move.seconds <= MAX_FORK_MOVE_SECONDS)) throw new Error(`Fork move seconds must be greater than 0 and at most ${MAX_FORK_MOVE_SECONDS}.`);
  }
}

export const forkMoveSeconds = (moves: readonly ForkMove[]) => moves.reduce((sum, move) => sum + move.seconds, 0);
/** The confirmed pose: the end of the last move. */
export function finalForkPose(forks: ForkMotion): Required<ForkPose> {
  const last = forks.moves?.[forks.moves.length - 1] ?? forks;
  return { height: last.height, reach: last.reach ?? 0 };
}
/** The pose `seconds` after the moves started; each move eases in and out. */
export function forkPoseAt(forks: ForkMotion, seconds: number): Required<ForkPose> {
  let from: Required<ForkPose> = { height: forks.height, reach: forks.reach ?? 0 }, time = Math.max(0, seconds);
  for (const move of forks.moves ?? []) {
    const to = { height: move.height, reach: move.reach ?? 0 };
    if (time < move.seconds) { const t = time / move.seconds, ease = t * t * (3 - 2 * t); return { height: from.height + (to.height - from.height) * ease, reach: from.reach + (to.reach - from.reach) * ease }; }
    time -= move.seconds; from = to;
  }
  return from;
}
