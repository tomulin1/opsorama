import { describe, expect, it, vi } from 'vitest';
import { ZOOM_RANGE, createSceneStore } from '@opsorama/core';
import { bindWheelZoom, wheelZoomValue } from '../packages/renderer-three/src/wheel-zoom';

function wheel(target: EventTarget, props: Partial<WheelEvent> = {}) {
  const event = Object.assign(new Event('wheel', { cancelable: true }), { deltaY: -100, deltaMode: 0, ctrlKey: false }, props);
  target.dispatchEvent(event);
  return event;
}
function setup(zoom = 1) {
  const canvas = new EventTarget(), labels = new EventTarget(), store = createSceneStore({ schemaVersion: 1, nodes: [] }, { zoom });
  const binding = bindWheelZoom([canvas, labels] as unknown as HTMLElement[], { getZoom: () => store.getSnapshot().settings.zoom, setZoom: value => store.configure({ zoom: value }) });
  return { canvas, labels, store, binding, zoom: () => store.getSnapshot().settings.zoom };
}

describe('wheel zoom', () => {
  it('zooms in on scrolling up by about 10% per notch and undoes a notch exactly enough', () => {
    expect(wheelZoomValue(1, -100)).toBe(1.1);
    expect(wheelZoomValue(2, -100)).toBe(2.2);
    expect(wheelZoomValue(1.1, 100)).toBe(1);
  });
  it('treats line and page deltas like pixel notches and stays inside the validated range', () => {
    expect(wheelZoomValue(1, -3, 1)).toBeCloseTo(wheelZoomValue(1, -100), 2);
    expect(wheelZoomValue(1, -1, 2)).toBeGreaterThan(wheelZoomValue(1, -100));
    expect(wheelZoomValue(4.9, -10000)).toBe(ZOOM_RANGE.max);
    expect(wheelZoomValue(.7, 10000)).toBe(ZOOM_RANGE.min);
  });
  it('writes the store from the canvas and from labels, and takes the wheel from the page', () => {
    const { canvas, labels, zoom } = setup();
    expect(wheel(canvas).defaultPrevented).toBe(true); expect(zoom()).toBe(1.1);
    expect(wheel(labels).defaultPrevented).toBe(true); expect(zoom()).toBe(1.21);
  });
  it('leaves the wheel to the page at a bound, except for ctrl+wheel and pinch', () => {
    const { canvas, store, zoom } = setup(ZOOM_RANGE.max), listener = vi.fn(); store.subscribe(listener);
    expect(wheel(canvas).defaultPrevented).toBe(false);
    expect(wheel(canvas, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(zoom()).toBe(ZOOM_RANGE.max); expect(listener).not.toHaveBeenCalled();
  });
  it('stops listening on dispose', () => {
    const { canvas, labels, binding, zoom } = setup();
    binding.dispose(); binding.dispose();
    expect(wheel(canvas).defaultPrevented).toBe(false); wheel(labels); expect(zoom()).toBe(1);
  });
});
