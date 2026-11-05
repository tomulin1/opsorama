'use client';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { SceneNode, SceneStore, SceneSnapshot, Selection, GroundNode, ZoneNode, AssetNode, PathNode, MarkerNode } from '@opsorama/core';
import { createSceneRenderer, sampleRendererFps, type RendererOptions, type SceneRenderer } from '@opsorama/renderer-three';
import { ZOOM_RANGE } from '@opsorama/core';
const Context = createContext<SceneStore | null>(null);
export function DashboardProvider({ store, children }: { store: SceneStore; children: ReactNode }) { return <Context.Provider value={store}>{children}</Context.Provider>; }
export function useSceneStore(): SceneStore { const store = useContext(Context); if (!store) throw new Error('A DashboardProvider is required.'); return store; }
export function useScene(): SceneSnapshot { const store = useSceneStore(); return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot); }
/** Controlled ZoomControl inputs bound to the provider's scene zoom setting. */
export function useSceneZoom(): SceneZoom { const store = useSceneStore(), value = useScene().settings.zoom; return { value, min: ZOOM_RANGE.min, max: ZOOM_RANGE.max, onChange: zoom => store.configure({ zoom }) }; }
export interface SceneZoom { value: number; min: number; max: number; onChange(value: number): void; }
/** Rendered frames per second of a mounted renderer, sampled once per second; null while unknown. Pass it to ZoomControl fps. */
export function useRendererFps(renderer: SceneRenderer | RefObject<SceneRenderer | null> | null | undefined, enabled = true): number | null {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    setFps(null);
    if (!enabled || !renderer) return;
    return sampleRendererFps(() => 'current' in renderer ? renderer.current : renderer, setFps);
  }, [renderer, enabled]);
  return fps;
}
export interface SceneCanvasProps extends RendererOptions { className?: string; style?: CSSProperties; children?: ReactNode; onReady?: (renderer: SceneRenderer) => void; }
export function SceneCanvas({ className, style, children, assets, controllers, instancing, wheelZoom, onReady, onSelect, onError }: SceneCanvasProps) {
  const store = useSceneStore(); const ref = useRef<HTMLDivElement>(null); const callbacks = useRef({ onReady, onSelect, onError }); callbacks.current = { onReady, onSelect, onError }; const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return; let renderer: SceneRenderer | undefined;
    setError(null);
    try { renderer = createSceneRenderer(ref.current, store, { assets, controllers, instancing, wheelZoom, onSelect: selection => callbacks.current.onSelect?.(selection), onError: err => { setError(err.message); callbacks.current.onError?.(err); } }); callbacks.current.onReady?.(renderer); }
    catch (err) { const error = err instanceof Error ? err : new Error(String(err)); setError(error.message); callbacks.current.onError?.(error); }
    return () => renderer?.dispose();
  }, [store, assets, controllers, instancing, wheelZoom]);
  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240, ...style }}><div ref={ref} style={{ position: 'absolute', inset: 0 }} />{children}{error && <div className="kit-scene-error" role="alert"><strong>Scene unavailable</strong><p>{error}</p><span>Use the HTML record list to continue working.</span></div>}</div>;
}
function Node({ node }: { node: SceneNode }) {
  const store = useSceneStore(); const signature = JSON.stringify(node);
  const id = node.id;
  useEffect(() => () => store.remove(id), [store, id]);
  useEffect(() => { store.upsert(JSON.parse(signature) as SceneNode); }, [store, signature]);
  return null;
}
export function Ground(props: Omit<GroundNode, 'kind'>) { return <Node node={{ ...props, kind: 'ground' }} />; }
export function Zone(props: Omit<ZoneNode, 'kind'>) { return <Node node={{ ...props, kind: 'zone' }} />; }
export function Asset(props: Omit<AssetNode, 'kind'>) { return <Node node={{ ...props, kind: 'asset' }} />; }
export function Path(props: Omit<PathNode, 'kind'>) { return <Node node={{ ...props, kind: 'path' }} />; }
/** A projected HTML marker without geometry, such as an alert. See `MarkerFields` in @opsorama/core. */
export function Marker(props: Omit<MarkerNode, 'kind'>) { return <Node node={{ ...props, kind: 'marker' }} />; }
export function EntityLayer<T>({ entities, mapEntity }: { entities: readonly T[]; mapEntity: (entity: T, index: number) => SceneNode }) { return <>{entities.map((entity, index) => { const node = mapEntity(entity, index); return <Node key={node.id} node={node} />; })}</>; }
export function EntityInspector({ children }: { children: (selection: Selection | null) => ReactNode }) { return <>{children(useScene().selection)}</>; }
