import type { CameraKeyframe, CameraPath, CameraTransitionResult } from '@opsorama/core';
import { ease, interpolatePose, type CameraPose } from './camera-rig';

/**
 * Pure playback of a `CameraPath`: timing, holds, easing, loops, cuts and how a path ends. No DOM, store or renderer state;
 * the renderer supplies the start pose, resolves each keyframe into a pose and advances the player by real seconds.
 */

/**
 * Resolves a keyframe into the pose the camera travels to, given `previous`, the pose it travels from. Called once per
 * keyframe and lap, when travel to it starts. Null (an unknown or hidden node) ends the path `'interrupted'`.
 */
export type KeyframeResolver = (keyframe: CameraKeyframe, previous: CameraPose) => CameraPose | null;

export interface CameraPathPlayer {
  /**
   * Advances by `seconds` of real time and returns the pose to draw. With `cut`, each travel is a cut at the moment the
   * keyframe is reached (the previous keyframe stays until then). Once the path has ended it returns the last pose.
   */
  advance(seconds: number, cut: boolean): CameraPose;
  /** Ends the path with `result` unless it has already ended; the first result wins. */
  finish(result: CameraTransitionResult): void;
  /** How the path ended, or null while it plays. */
  readonly result: CameraTransitionResult | null;
  /** Resolves with the result once the path ends. */
  readonly finished: Promise<CameraTransitionResult>;
}

/** Starts playing `path` (validated with `validateCameraPath`) from the camera pose `start`. */
export function createCameraPathPlayer(path: CameraPath, start: CameraPose, resolve: KeyframeResolver): CameraPathPlayer {
  const keyframes = path.keyframes, lap = keyframes.reduce((total, keyframe) => total + keyframe.seconds + (keyframe.hold ?? 0), 0);
  let result: CameraTransitionResult | null = null, settle: (value: CameraTransitionResult) => void = () => undefined;
  const finished = new Promise<CameraTransitionResult>(done => { settle = done; });
  const finish = (value: CameraTransitionResult) => { if (result) return; result = value; settle(value); };
  /** Keyframe travelled to, seconds since travel to it began, the pose travelled from and to, and the pose last drawn. */
  let index = 0, elapsed = 0, from = start, pose = start;
  let to = resolve(keyframes[0], start);
  if (!to) finish('interrupted');
  return {
    get result() { return result; },
    finished,
    finish,
    advance(seconds, cut) {
      if (result || !to) return pose;
      elapsed += Math.max(0, seconds);
      // After a long gap (a hidden tab) a loop keeps its phase instead of replaying every lap.
      if (path.loop && elapsed > lap) elapsed %= lap;
      for (;;) {
        const keyframe = keyframes[index], travel = keyframe.seconds, hold = keyframe.hold ?? 0;
        if (elapsed < travel + hold) {
          const k = elapsed >= travel ? 1 : cut ? 0 : ease(elapsed / travel, keyframe.easing ?? 'ease-in-out');
          return pose = interpolatePose(from, to, k);
        }
        elapsed -= travel + hold; from = to; pose = to; index++;
        if (index === keyframes.length) {
          if (!path.loop) { finish('completed'); return pose; }
          index = 0;
        }
        const next = resolve(keyframes[index], from);
        if (!next) { finish('interrupted'); return pose; }
        to = next;
      }
    },
  };
}
