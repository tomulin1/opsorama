/**
 * The renderer's frame hook (`SceneRenderer.onFrame`): listeners called once per rendered frame, or on a fixed simulation
 * step. Pure: the renderer feeds it real seconds and the scene settings of each frame, so it runs in tests without a browser.
 */

/** One call of a frame listener. */
export interface SceneFrame {
  /**
   * Scene seconds this call covers. A fixed-step listener always gets its `step`. A per-frame listener gets the real frame
   * time (capped at 0.05 s, like node motion) times `SceneSettings.speed`, and 0 while the scene is paused.
   */
  delta: number;
  /** Scene seconds this listener has seen since it subscribed: the sum of its `delta` values. */
  time: number;
  /** Calls of this listener since it subscribed, starting at 1. For a fixed-step listener this counts steps, not rendered frames. */
  frame: number;
  /** `SceneSettings.paused` in this frame. Fixed-step listeners are never called while paused, so they always see false. */
  paused: boolean;
  /** Whether node motion animates in this frame: `SceneSettings.motion` on and no reduced-motion preference. Fixed steps keep running when it is false; a listener can snap instead of animating. */
  animated: boolean;
  /**
   * Fixed-step listeners only: scene seconds skipped in this frame because more than `maxSteps` steps were due (a slow
   * frame, a high speed or a small step). The same value on each step of that frame; 0 otherwise and for per-frame listeners.
   */
  dropped: number;
}

/** Options of `SceneRenderer.onFrame`. Without `step` the listener is called once per rendered frame. */
export interface FrameListenerOptions {
  /**
   * Fixed simulation step in scene seconds, within `FRAME_STEP_RANGE` (1/240–1/10 s), for example 1/60. The listener is
   * called zero or more times per rendered frame, before node motion, so that the scene time it has seen follows the real
   * frame time times `SceneSettings.speed`. Not called while the scene is paused or the document is hidden; it keeps
   * running with motion off or reduced motion.
   */
  step?: number;
  /** Fixed-step listeners only: at most this many steps per rendered frame, an integer from 1 to `MAX_FRAME_STEPS`. Default `DEFAULT_MAX_FRAME_STEPS` (4). Scene time beyond it is dropped and reported in `SceneFrame.dropped`. */
  maxSteps?: number;
}

/** Valid `FrameListenerOptions.step` values in seconds. */
export const FRAME_STEP_RANGE = Object.freeze({ min: 1 / 240, max: 1 / 10 });
/** Default `FrameListenerOptions.maxSteps`. */
export const DEFAULT_MAX_FRAME_STEPS = 4;
/** Largest `FrameListenerOptions.maxSteps`. */
export const MAX_FRAME_STEPS = 60;

/** The frame settings the renderer passes for each rendered frame. */
export interface FrameClockState {
  /** `SceneSettings.speed`. */ speed: number;
  /** `SceneSettings.paused`. */ paused: boolean;
  /** Motion on and no reduced-motion preference. */ animated: boolean;
  /** The document is hidden: no listener runs and fixed-step accumulators keep their value. */ hidden: boolean;
}

/** Throws an actionable error for an invalid listener or options of `onFrame`. */
export function validateFrameListener(listener: unknown, options: FrameListenerOptions = {}): void {
  if (typeof listener !== 'function') throw new Error(`onFrame needs a listener function; got ${listener === null ? 'null' : typeof listener}. Pass (frame) => { ... }.`);
  if (options === null || typeof options !== 'object') throw new Error('onFrame options must be an object such as { step: 1 / 60 }, or omitted for a listener called once per rendered frame.');
  const { step, maxSteps } = options;
  if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step < FRAME_STEP_RANGE.min - 1e-12 || step > FRAME_STEP_RANGE.max + 1e-12)) throw new Error(`onFrame step must be between 1/240 and 1/10 seconds (${FRAME_STEP_RANGE.min.toFixed(5)}–${FRAME_STEP_RANGE.max}); got ${String(step)}. Pass a fixed step such as 1 / 60, or omit step for a listener called once per rendered frame.`);
  if (maxSteps !== undefined) {
    if (step === undefined) throw new Error('onFrame maxSteps applies only to fixed-step listeners. Pass step as well (for example { step: 1 / 60, maxSteps: 8 }), or omit maxSteps.');
    if (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_FRAME_STEPS) throw new Error(`onFrame maxSteps must be an integer from 1 to ${MAX_FRAME_STEPS}; got ${String(maxSteps)}. The default is ${DEFAULT_MAX_FRAME_STEPS}.`);
  }
}

type Subscription = { listener: (frame: SceneFrame) => void; step: number | null; maxSteps: number; accumulator: number; time: number; count: number; active: boolean };

/** The listener registry of one renderer. */
export interface FrameClock {
  /** Subscribes a listener (validated, see `validateFrameListener`). Returns the unsubscribe function; calling it more than once, or from inside a listener, is safe. */
  add(listener: (frame: SceneFrame) => void, options?: FrameListenerOptions): () => void;
  /**
   * Runs the due fixed steps for `dt` real seconds of this frame: their accumulators grow by `dt · speed`, and each listener
   * runs once per whole step, at most `maxSteps` times. Does nothing while `paused` or `hidden` (accumulators keep their value).
   */
  steps(dt: number, state: FrameClockState): void;
  /** Calls the per-frame listeners once for `dt` real seconds of this frame (delta 0 while `paused`); nothing while `hidden`. */
  frame(dt: number, state: FrameClockState): void;
  /** Removes every listener. */
  clear(): void;
  /** Number of subscribed listeners. */
  readonly size: number;
}

/**
 * Creates a frame clock. `onError` receives what a listener throws; the other listeners and the frame loop continue. A
 * listener subscribed during a pass is first called in the next pass; one unsubscribed during a pass is not called again.
 */
export function createFrameClock(onError: (error: unknown) => void): FrameClock {
  const subscriptions = new Set<Subscription>();
  const call = (subscription: Subscription, frame: SceneFrame) => { try { subscription.listener(frame); } catch (error) { onError(error); } };
  return {
    add(listener, options = {}) {
      validateFrameListener(listener, options);
      const subscription: Subscription = { listener, step: options.step ?? null, maxSteps: options.maxSteps ?? DEFAULT_MAX_FRAME_STEPS, accumulator: 0, time: 0, count: 0, active: true };
      subscriptions.add(subscription);
      return () => { subscription.active = false; subscriptions.delete(subscription); };
    },
    steps(dt, state) {
      if (state.paused || state.hidden || !(dt > 0)) return;
      for (const subscription of [...subscriptions]) {
        if (subscription.step === null || !subscription.active) continue;
        const step = subscription.step;
        subscription.accumulator += dt * state.speed;
        // A tiny tolerance keeps a frame of exactly n steps from losing the last one to rounding.
        const due = Math.floor(subscription.accumulator / step + 1e-9), run = Math.min(due, subscription.maxSteps);
        const dropped = (due - run) * step;
        subscription.accumulator = Math.max(0, subscription.accumulator - due * step);
        for (let index = 0; index < run && subscription.active; index++) {
          subscription.time += step; subscription.count++;
          call(subscription, { delta: step, time: subscription.time, frame: subscription.count, paused: false, animated: state.animated, dropped });
        }
      }
    },
    frame(dt, state) {
      if (state.hidden) return;
      const delta = state.paused ? 0 : Math.max(0, dt) * state.speed;
      for (const subscription of [...subscriptions]) {
        if (subscription.step !== null || !subscription.active) continue;
        subscription.time += delta; subscription.count++;
        call(subscription, { delta, time: subscription.time, frame: subscription.count, paused: state.paused, animated: state.animated, dropped: 0 });
      }
    },
    clear() { for (const subscription of subscriptions) subscription.active = false; subscriptions.clear(); },
    get size() { return subscriptions.size; },
  };
}
