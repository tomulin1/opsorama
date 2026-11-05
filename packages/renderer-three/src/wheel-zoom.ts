import { ZOOM_RANGE } from '@opsorama/core';

interface WheelZoomCallbacks {
  getZoom(): number;
  setZoom(zoom: number): void;
}

/** One 100 px wheel notch changes zoom by 10%, so repeated notches feel even across the range. */
const ZOOM_PER_PIXEL = Math.log(1.1) / 100;
// Pixels per WheelEvent.deltaMode unit: pixels, lines, pages. Firefox reports one notch as three lines.
const DELTA_MODE_PIXELS: readonly number[] = [1, 33, 300];

/** Scene zoom after a wheel delta: scrolling up zooms in. Clamped to ZOOM_RANGE and rounded to remove binary drift. */
export function wheelZoomValue(zoom: number, deltaY: number, deltaMode = 0): number {
  const next = zoom * Math.exp(-deltaY * (DELTA_MODE_PIXELS[deltaMode] ?? 1) * ZOOM_PER_PIXEL);
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(next * 1e4) / 1e4));
}

/** Wheel input over the scene writes only the zoom setting; hosts observe it through the store. */
export function bindWheelZoom(elements: readonly HTMLElement[], callbacks: WheelZoomCallbacks) {
  function wheel(event: WheelEvent) {
    const zoom = callbacks.getZoom(), next = wheelZoomValue(zoom, event.deltaY, event.deltaMode);
    // At a bound the wheel stays with the page around an embedded scene. Ctrl+wheel and trackpad pinch never zoom the page.
    if (next !== zoom || event.ctrlKey) event.preventDefault();
    if (next !== zoom) callbacks.setZoom(next);
  }
  elements.forEach(element => element.addEventListener('wheel', wheel, { passive: false }));
  return { dispose() { elements.forEach(element => element.removeEventListener('wheel', wheel)); } };
}
