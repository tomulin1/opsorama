'use client';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { SceneNode, SceneStore, SceneSnapshot, Selection, GroundNode, ZoneNode, AssetNode, PathNode, MarkerNode } from '@opsorama/core';
import { createNodePreview, createSceneRenderer, loadingIndicatorAttributes, loadProgress, loadStateText, sampleRendererFps, SCENE_LOADING_CLASSES, SCENE_LOADING_STYLES, type NodePreview as NodePreviewHandle, type NodePreviewOptions, type RendererOptions, type SceneLoadState, type SceneRenderer } from '@opsorama/three';
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
export interface SceneCanvasProps extends Omit<RendererOptions, 'loadingIndicator'> {
  className?: string; style?: CSSProperties; children?: ReactNode; onReady?: (renderer: SceneRenderer) => void;
  /** Content of the loading indicator shown until the first frame, also in server-rendered HTML. Default: spinner, progress bar and status text. Pass a node or a function of the load state (null before the renderer starts) to replace the content, or false for no indicator. */
  loading?: false | ReactNode | ((state: SceneLoadState | null) => ReactNode);
}
/** Default loading indicator content for a load state. */
export function SceneLoadingContent({ state }: { state: SceneLoadState | null }) {
  return <><span className={SCENE_LOADING_CLASSES.spinner} aria-hidden="true" /><span className={SCENE_LOADING_CLASSES.title} aria-hidden="true">Loading scene</span><span className={SCENE_LOADING_CLASSES.bar} aria-hidden="true"><span style={{ transform: `scaleX(${loadProgress(state)})` }} /></span><span className={SCENE_LOADING_CLASSES.detail} aria-hidden="true">{loadStateText(state)}</span></>;
}
export function SceneCanvas({ className, style, children, assets, controllers, instancing, wheelZoom, buildBudget, loading, onReady, onSelect, onError, onLoad }: SceneCanvasProps) {
  const store = useSceneStore(); const ref = useRef<HTMLDivElement>(null); const callbacks = useRef({ onReady, onSelect, onError, onLoad }); callbacks.current = { onReady, onSelect, onError, onLoad }; const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<SceneLoadState | null>(null);
  const theme = useSyncExternalStore(store.subscribe, () => store.getSnapshot().settings.theme, () => store.getSnapshot().settings.theme);
  useEffect(() => {
    if (!ref.current) return; let renderer: SceneRenderer | undefined;
    setError(null); setLoad(null);
    try { renderer = createSceneRenderer(ref.current, store, { assets, controllers, instancing, wheelZoom, buildBudget, loadingIndicator: false, onLoad: state => { setLoad(state); callbacks.current.onLoad?.(state); }, onSelect: selection => callbacks.current.onSelect?.(selection), onError: err => { setError(err.message); callbacks.current.onError?.(err); } }); callbacks.current.onReady?.(renderer); }
    catch (err) { const error = err instanceof Error ? err : new Error(String(err)); setError(error.message); callbacks.current.onError?.(error); }
    return () => renderer?.dispose();
  }, [store, assets, controllers, instancing, wheelZoom, buildBudget]);
  const indicator = loading !== false && !error && load?.phase !== 'loaded'
    ? <div className={SCENE_LOADING_CLASSES.root} data-theme={theme} {...loadingIndicatorAttributes(load)}><style>{SCENE_LOADING_STYLES}</style>{typeof loading === 'function' ? loading(load) : loading ?? <SceneLoadingContent state={load} />}</div>
    : null;
  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240, ...style }}><div ref={ref} style={{ position: 'absolute', inset: 0 }} />{children}{indicator}{error && <div className="kit-scene-error" role="alert"><strong>Scene unavailable</strong><p>{error}</p><span>Use the HTML record list to continue working.</span></div>}</div>;
}
export interface NodePreviewProps extends Omit<NodePreviewOptions, 'nodeId'> {
  /** The scene node to copy, or null for an empty preview. Changing it keeps the canvas. */
  nodeId: string | null;
  /** Size the preview with a class or style; the default height is 160 px. */
  className?: string; style?: CSSProperties;
  /** Receives the mounted preview, for example to read `getState()` in tests. */
  onReady?: (preview: NodePreviewHandle) => void;
}
/** A live copy of a node from the provider's scene in its own canvas, for an inspector; see `createNodePreview`. `assets`, `spin` and `maxNodes` are mount-time. */
export function NodePreview({ nodeId, assets, spin, maxNodes, className, style, onReady, onError }: NodePreviewProps) {
  const store = useSceneStore(); const ref = useRef<HTMLDivElement>(null), preview = useRef<NodePreviewHandle | null>(null), latest = useRef({ nodeId, onReady, onError }); latest.current = { nodeId, onReady, onError };
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return; let view: NodePreviewHandle | undefined; setError(null);
    try { view = createNodePreview(ref.current, store, { assets, spin, maxNodes, nodeId: latest.current.nodeId, onError: err => { setError(err.message); latest.current.onError?.(err); } }); preview.current = view; latest.current.onReady?.(view); }
    catch (err) { const failure = err instanceof Error ? err : new Error(String(err)); setError(failure.message); latest.current.onError?.(failure); }
    return () => { view?.dispose(); preview.current = null; };
  }, [store, assets, spin, maxNodes]);
  useEffect(() => { setError(null); preview.current?.setNode(nodeId); }, [nodeId]);
  return <div className={className} style={{ position: 'relative', width: '100%', height: 160, ...style }}><div ref={ref} style={{ position: 'absolute', inset: 0 }} />{error && <div className="kit-scene-error" role="alert"><strong>Preview unavailable</strong><p>{error}</p></div>}</div>;
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
