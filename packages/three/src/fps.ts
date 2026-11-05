/** The part of SceneRenderer an FPS sampler reads. */
export interface FrameSource { getDiagnostics(): { renderedFrames: number; disposed: boolean }; }
export interface FpsSamplerOptions { intervalMs?: number; }

/**
 * Samples completed scene frames once per interval without a second animation loop.
 * Reports null until two samples of the same live renderer exist, while the document is hidden, and after disposal.
 * Returns a stop function that removes the timer and the visibility listener.
 */
export function sampleRendererFps(source: () => FrameSource | null, onSample: (fps: number | null) => void, options: FpsSamplerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? 1000;
  if (!(intervalMs > 0)) throw new Error('FPS sample interval must be positive.');
  let previous: { renderer: FrameSource; frames: number; time: number } | null = null, stopped = false;
  const sample = () => {
    const renderer = source();
    if (document.hidden || !renderer) { previous = null; onSample(null); return; }
    const { renderedFrames, disposed } = renderer.getDiagnostics();
    if (disposed) { previous = null; onSample(null); return; }
    const time = performance.now();
    onSample(previous?.renderer === renderer && time > previous.time ? Math.round((renderedFrames - previous.frames) * 1000 / (time - previous.time)) : null);
    previous = { renderer, frames: renderedFrames, time };
  };
  const visibility = () => { previous = null; onSample(null); if (!document.hidden) sample(); };
  sample();
  const timer = window.setInterval(sample, intervalMs);
  document.addEventListener('visibilitychange', visibility);
  return () => { if (stopped) return; stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
}
