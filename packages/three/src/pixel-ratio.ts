/*
 * Canvas pixel ratio of the scene renderer and the node preview, kept current when the display's ratio changes. Internal
 * to the package.
 */

/** Highest canvas pixel ratio: sharper canvases cost fill rate without a visible gain on dashboards. */
export const MAX_CANVAS_PIXEL_RATIO = 2;

/** Device pixels per CSS pixel a canvas draws at for a display ratio: the ratio (1 when unknown), at most 2. */
export function canvasPixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(devicePixelRatio || 1, MAX_CANVAS_PIXEL_RATIO);
}

/** What `watchPixelRatio` reads from `window`; tests pass their own. */
export interface PixelRatioEnvironment {
  readonly devicePixelRatio: number;
  matchMedia(query: string): Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Calls `listener` with the new canvas pixel ratio (see `canvasPixelRatio`) each time the display's ratio changes: browser
 * zoom, or the window moving to a screen with another density. A resize observer misses the second case, because the
 * canvas keeps its CSS size. It listens to a `resolution` media query for the current ratio and renews the query after
 * each change. Returns the stop function, safe to call more than once.
 */
export function watchPixelRatio(listener: (ratio: number) => void, environment: PixelRatioEnvironment = window): () => void {
  let query: ReturnType<PixelRatioEnvironment['matchMedia']> | null = null;
  const listen = () => {
    query = environment.matchMedia(`(resolution: ${environment.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', changed);
  };
  const stop = () => { query?.removeEventListener('change', changed); query = null; };
  function changed() {
    stop(); listen();
    listener(canvasPixelRatio(environment.devicePixelRatio));
  }
  listen();
  return stop;
}
