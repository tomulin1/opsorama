import type * as THREE from 'three';
import type { CameraView, SceneStore } from '@opsorama/core';
import type { FrameListenerOptions, SceneFrame } from './frame-clock';

/**
 * Renderer access for a plugin's `setup`. Valid until the plugin's cleanup runs; the renderer disposes everything a plugin
 * did not add itself.
 */
export interface RendererPluginContext {
  /** The Three.js scene. Objects a plugin adds are its own: remove and dispose them in the cleanup. */
  readonly scene: THREE.Scene;
  /** The WebGL renderer. Do not replace its render call or dispose it; the scene renderer draws every frame and owns its lifecycle. */
  readonly renderer: THREE.WebGLRenderer;
  /** The element the scene renderer was mounted in; it holds the canvas and the label layer. */
  readonly container: HTMLElement;
  /** The scene store the renderer draws. */
  readonly store: SceneStore;
  /** The camera drawn now; switching `CameraSettings.projection` swaps it, so call this each time instead of keeping the result. */
  camera(): THREE.OrthographicCamera | THREE.PerspectiveCamera;
  /**
   * The built object of a node, or null for an unknown or hidden node and one not built yet (await `loaded` first). Read
   * only: the renderer rebuilds it when the node changes, so look it up again instead of keeping it, and do not move,
   * re-parent or dispose it. Meshes drawn through instancing are hidden proxies whose transforms stay current.
   */
  nodeObject(id: string): THREE.Object3D | null;
  /** Resolves once the initial scene is built and its first frame drawn; rejects when the graphics context is lost first (`SceneRenderer.loaded`). */
  readonly loaded: Promise<void>;
  /** `SceneRenderer.onFrame`. Subscriptions end at the latest when the renderer is disposed. */
  onFrame(listener: (frame: SceneFrame) => void, options?: FrameListenerOptions): () => void;
  /** `SceneRenderer.onCameraChange`. Subscriptions end at the latest when the renderer is disposed. */
  onCameraChange(listener: (view: CameraView) => void): () => void;
  /** Reports an error to `RendererOptions.onError`, prefixed with the plugin name. */
  reportError(error: unknown): void;
}

/**
 * Code that extends a mounted renderer with its own Three.js objects, frame listeners or event handling, for example a
 * destination ring, a custom overlay or a measurement readout. Passed in `RendererOptions.plugins` (mount-time).
 */
export interface RendererPlugin {
  /** Unique among the renderer's plugins; used in error messages. */
  readonly name: string;
  /**
   * Runs once, in the order of `plugins`, after the renderer's first scene sync (during a sliced initial load only part of
   * the scene may be built: await `context.loaded` for all of it). Returns an optional cleanup, called once in reverse
   * order when the renderer is disposed, before the renderer releases its own resources. If a setup throws,
   * `createSceneRenderer` runs the cleanups of the plugins set up so far, disposes the renderer and throws an error naming
   * the plugin.
   */
  setup(context: RendererPluginContext): void | (() => void);
}

/** Throws an actionable error for a `plugins` option that is not a list of plugins with unique names. */
export function validateRendererPlugins(plugins: unknown): asserts plugins is readonly RendererPlugin[] {
  if (!Array.isArray(plugins)) throw new Error('RendererOptions.plugins must be an array of plugins ({ name, setup }); omit it for no plugins.');
  const names = new Set<string>();
  plugins.forEach((plugin: unknown, index) => {
    const candidate = plugin as Partial<RendererPlugin> | null;
    if (!candidate || typeof candidate !== 'object' || typeof candidate.name !== 'string' || !candidate.name.trim()) throw new Error(`Renderer plugin at index ${index} needs a non-empty string name, such as { name: 'destination-ring', setup(context) { ... } }.`);
    if (typeof candidate.setup !== 'function') throw new Error(`Renderer plugin "${candidate.name}" needs a setup(context) function.`);
    if (names.has(candidate.name)) throw new Error(`Two renderer plugins are named "${candidate.name}". Plugin names must be unique within one renderer: rename one, or pass the plugin once.`);
    names.add(candidate.name);
  });
}

const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
/** The message of an error as a sentence, ending in a full stop. */
const sentence = (error: unknown) => { const message = asError(error).message.trim(); return /[.!?]$/.test(message) ? message : `${message}.`; };

/** Set-up plugins of one renderer. */
export interface PluginHost {
  /** Runs every cleanup once, in reverse setup order. A throwing cleanup is reported to `onError`; the others still run. */
  dispose(): void;
}

/**
 * Runs each plugin's setup in order with its context. When a setup throws, the cleanups collected so far run in reverse
 * order and an error naming the plugin is thrown, with the original error as its `cause`.
 */
export function setupRendererPlugins(plugins: readonly RendererPlugin[], context: (plugin: RendererPlugin) => RendererPluginContext, onError: (error: Error) => void): PluginHost {
  const cleanups: { name: string; cleanup: () => void }[] = [];
  let disposed = false;
  const host: PluginHost = {
    dispose() {
      if (disposed) return; disposed = true;
      for (const { name, cleanup } of cleanups.reverse()) {
        try { cleanup(); } catch (error) { onError(new Error(`Renderer plugin "${name}" failed during cleanup: ${sentence(error)}`, { cause: error })); }
      }
      cleanups.length = 0;
    },
  };
  for (const plugin of plugins) {
    let cleanup: void | (() => void);
    try { cleanup = plugin.setup(context(plugin)); }
    catch (error) { host.dispose(); throw new Error(`Renderer plugin "${plugin.name}" failed during setup: ${sentence(error)} The renderer was disposed; fix the plugin or remove it from plugins.`, { cause: error }); }
    if (typeof cleanup === 'function') cleanups.push({ name: plugin.name, cleanup });
  }
  return host;
}
