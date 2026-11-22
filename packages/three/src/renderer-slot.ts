import type { SceneRenderer } from './index';

/**
 * The renderer of one scene provider. The React and Vue `DashboardProvider` each own one: their `SceneCanvas` registers the
 * renderer it mounts, and `useSceneRenderer()` / `useCameraView()` read it, so components anywhere under the provider reach
 * the camera without `onReady`. A custom adapter can use it the same way.
 */
export interface RendererSlot {
  /** The registered renderer, or null before a canvas mounted and after it unmounted. */
  get(): SceneRenderer | null;
  /**
   * Registers a mounted renderer and returns the function that unregisters it. Throws an actionable error while another
   * renderer is registered: one provider (and store) drives one canvas.
   */
  register(renderer: SceneRenderer): () => void;
  /** Calls `listener` after every registration change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createRendererSlot(): RendererSlot {
  let current: SceneRenderer | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  return {
    get: () => current,
    register(renderer) {
      if (current && current !== renderer) throw new Error('Two SceneCanvas components are mounted under one DashboardProvider. A provider and its store drive one canvas: give each canvas its own DashboardProvider and store, or unmount the first canvas before mounting the second. For a second view of one node, use NodePreview.');
      current = renderer; notify();
      return () => { if (current === renderer) { current = null; notify(); } };
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
