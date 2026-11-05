import type { SceneNode, SceneSettings } from '@opsorama/core';
import type { EcommerceSimulation } from './simulation';
import type { EcommerceSnapshot } from './model';

/** Seconds between scene publishes and between record updates; the feed itself runs on a finer fixed step. */
const SCENE_INTERVAL = .1, RECORDS_INTERVAL = .25;
/** Longest frame the feed catches up on; a hidden tab stops it instead of replaying the gap. */
const MAX_FRAME = .25;

export interface FeedLoopOptions {
  /** The current feed. Read each frame, so a host can swap it without restarting the loop. */
  feed(): EcommerceSimulation;
  /** The scene clock: pause and speed apply to the feed and the scene alike. */
  clock(): Pick<SceneSettings, 'paused' | 'speed'>;
  /** Receives the feed's nodes at most every 0.1 s, and only after they changed. */
  onScene(nodes: SceneNode[]): void;
  /** Receives the records at most every 0.25 s, and only after they changed. */
  onRecords?(snapshot: EcommerceSnapshot): void;
}

/** Runs the mock feed on animation frames until the returned function is called. */
export function runFeedLoop({ feed, clock, onScene, onRecords }: FeedLoopOptions): () => void {
  let frame = 0, last = performance.now(), sceneAt = -Infinity, recordsAt = -Infinity, sceneSeen = -1, recordsSeen = -1;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const seconds = now / 1000, current = feed(), { paused, speed } = clock();
    // The first frame's timestamp can lie just before the loop started.
    if (!paused) current.advance(Math.max(0, Math.min(MAX_FRAME, (now - last) / 1000)) * speed);
    last = now;
    if (current.sceneRevision !== sceneSeen && seconds - sceneAt >= SCENE_INTERVAL) { sceneSeen = current.sceneRevision; sceneAt = seconds; onScene(current.nodes()); }
    if (onRecords && current.recordsRevision !== recordsSeen && seconds - recordsAt >= RECORDS_INTERVAL) { recordsSeen = current.recordsRevision; recordsAt = seconds; onRecords(current.snapshot()); }
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
