/*
 * Off-screen detection for the scene renderer: while its canvas is outside the viewport (scrolled away, or in a panel
 * hidden with `display: none`) it keeps simulating but does not draw. Internal to the package.
 */

/** What one animation frame does: `simulate` node motion, controllers and frame listeners; `draw` labels and the image. */
export interface FrameWork { simulate: boolean; draw: boolean }

/**
 * The work of a frame: nothing while the document is hidden; everything until the first frame is drawn (so `loaded`
 * resolves for a scene mounted off-screen) and while the canvas is on screen; otherwise simulation only, so motion,
 * controllers and frame listeners stay on time and the next drawn frame shows the current state.
 */
export function frameWork(state: { hidden: boolean; loaded: boolean; onScreen: boolean }): FrameWork {
  if (state.hidden) return { simulate: false, draw: false };
  return { simulate: true, draw: !state.loaded || state.onScreen };
}

/** What `watchOnScreen` needs from the environment; tests pass their own. */
export interface OnScreenEnvironment {
  IntersectionObserver?: new (callback: (entries: { isIntersecting: boolean }[]) => void) => { observe(target: Element): void; disconnect(): void };
}

/**
 * Calls `listener` with whether `element` intersects the viewport, each time that changes. Without
 * `IntersectionObserver` the element counts as always on screen and `listener` is never called. Returns the stop
 * function, safe to call more than once.
 */
export function watchOnScreen(element: Element, listener: (onScreen: boolean) => void, environment: OnScreenEnvironment = globalThis as OnScreenEnvironment): () => void {
  const Observer = environment.IntersectionObserver;
  if (!Observer) return () => undefined;
  let last: boolean | null = null;
  const observer = new Observer(entries => {
    const latest = entries[entries.length - 1];
    if (!latest || latest.isIntersecting === last) return;
    last = latest.isIntersecting; listener(last);
  });
  observer.observe(element);
  return () => observer.disconnect();
}
