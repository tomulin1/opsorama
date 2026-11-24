'use client';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { CameraView, SceneNode, SceneStore, SceneSnapshot, Selection, GroundNode, ZoneNode, AssetNode, PathNode, MarkerNode, GroupNode, ShapeNode, LineNode, TextNode, ImageNode } from '@opsorama/core';
import { createNodePreview, createRendererSlot, IMAGE_LOAD_ERROR, createSceneRenderer, loadingIndicatorAttributes, loadProgress, loadStateText, sampleRendererFps, SCENE_LOADING_CLASSES, SCENE_LOADING_STYLES, validateFrameListener, type FrameListenerOptions, type NodePreview as NodePreviewHandle, type NodePreviewOptions, type NodeHtmlHandle, type NodeHtmlOptions, type RendererOptions, type RendererSlot, type SceneFrame, type SceneLoadState, type ScenePointerEvent, type SceneRenderer } from '@opsorama/three';
import { ZOOM_RANGE } from '@opsorama/core';
import { createPortal } from 'react-dom';
const Context = createContext<SceneStore | null>(null);
const RendererContext = createContext<RendererSlot | null>(null);
/** Provides the scene store to every component below it, and a slot for the renderer of its one `SceneCanvas` (see `useSceneRenderer`). */
export function DashboardProvider({ store, children }: { store: SceneStore; children: ReactNode }) { const [slot] = useState(createRendererSlot); return <Context.Provider value={store}><RendererContext.Provider value={slot}>{children}</RendererContext.Provider></Context.Provider>; }
export function useSceneStore(): SceneStore { const store = useContext(Context); if (!store) throw new Error('A DashboardProvider is required.'); return store; }
const noRenderer = () => null;
/** The renderer of the provider's `SceneCanvas`, or null before it mounts, after it unmounts and during server rendering. Use it for the camera API (`frame`, `overview`, `setCameraView`) from any component under the provider. */
export function useSceneRenderer(): SceneRenderer | null {
  const slot = useContext(RendererContext); if (!slot) throw new Error('A DashboardProvider is required.');
  return useSyncExternalStore(slot.subscribe, slot.get, noRenderer);
}
/** The current camera view of the provider's renderer, updated at most once per rendered frame while the view changes; null without a mounted renderer. */
export function useCameraView(): CameraView | null {
  const renderer = useSceneRenderer(), [view, setView] = useState<CameraView | null>(null);
  useEffect(() => { if (!renderer) { setView(null); return; } setView(renderer.getCameraView()); return renderer.onCameraChange(setView); }, [renderer]);
  return renderer ? view : null;
}
/**
 * Calls `listener` from the frame loop of the provider's renderer, like `SceneRenderer.onFrame`: once per rendered frame,
 * or on a fixed simulation step with `options.step`. The latest `listener` is called without resubscribing, so an inline
 * function is fine; a change of `step` or `maxSteps` resubscribes (a fixed-step listener then starts a new scene time).
 * Subscribes once a `SceneCanvas` under the provider has mounted and unsubscribes on unmount; does nothing during server
 * rendering. Throws an actionable error for invalid options.
 */
export function useSceneFrame(listener: (frame: SceneFrame) => void, options: FrameListenerOptions = {}): void {
  validateFrameListener(listener, options);
  const renderer = useSceneRenderer(), latest = useRef(listener), { step, maxSteps } = options;
  useEffect(() => { latest.current = listener; });
  useEffect(() => renderer?.onFrame(frame => latest.current(frame), { ...(step !== undefined ? { step } : {}), ...(maxSteps !== undefined ? { maxSteps } : {}) }), [renderer, step, maxSteps]);
}
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
  /**
   * Pointer events on the scene; see `RendererOptions.onPointer`. Read through a ref: a new function takes effect without
   * remounting the renderer. The renderer reports pointer events only when a handler was given when it mounted, so a
   * scene without one does no pointer reporting work; the first handler given after such a mount remounts the renderer
   * once. Removing the handler later keeps the renderer (events then go nowhere).
   */
  onPointer?: RendererOptions['onPointer'];
  /** Renderer plugins; see `RendererOptions.plugins`. Mount-time: keep the array stable (module constant or `useMemo`), because a new array remounts the renderer. */
  plugins?: RendererOptions['plugins'];
  className?: string; style?: CSSProperties; children?: ReactNode; onReady?: (renderer: SceneRenderer) => void;
  /** Content of the loading indicator shown until the first frame, also in server-rendered HTML. Default: spinner, progress bar and status text. Pass a node or a function of the load state (null before the renderer starts) to replace the content, or false for no indicator. */
  loading?: false | ReactNode | ((state: SceneLoadState | null) => ReactNode);
}
/** Default loading indicator content for a load state. */
export function SceneLoadingContent({ state }: { state: SceneLoadState | null }) {
  return <><span className={SCENE_LOADING_CLASSES.spinner} aria-hidden="true" /><span className={SCENE_LOADING_CLASSES.title} aria-hidden="true">Loading scene</span><span className={SCENE_LOADING_CLASSES.bar} aria-hidden="true"><span style={{ transform: `scaleX(${loadProgress(state)})` }} /></span><span className={SCENE_LOADING_CLASSES.detail} aria-hidden="true">{loadStateText(state)}</span></>;
}
export function SceneCanvas({ className, style, children, assets, controllers, instancing, wheelZoom, touchGestures, buildBudget, plugins, loading, onReady, onSelect, onError, onLoad, onPointer }: SceneCanvasProps) {
  const store = useSceneStore(), slot = useContext(RendererContext); const ref = useRef<HTMLDivElement>(null); const callbacks = useRef({ onReady, onSelect, onError, onLoad, onPointer }); callbacks.current = { onReady, onSelect, onError, onLoad, onPointer }; const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<SceneLoadState | null>(null);
  // Once a handler has been seen the renderer forwards pointer events; the first handler after a mount without one remounts it.
  const pointerSeen = useRef(false); if (onPointer) pointerSeen.current = true; const reportPointer = pointerSeen.current;
  const theme = useSyncExternalStore(store.subscribe, () => store.getSnapshot().settings.theme, () => store.getSnapshot().settings.theme);
  useEffect(() => {
    if (!ref.current) return; let renderer: SceneRenderer | undefined, unregister: (() => void) | undefined;
    setError(null); setLoad(null);
    try { renderer = createSceneRenderer(ref.current, store, { assets, controllers, instancing, wheelZoom, touchGestures, buildBudget, plugins, loadingIndicator: false, ...(reportPointer ? { onPointer: (event: ScenePointerEvent) => callbacks.current.onPointer?.(event) } : {}), onLoad: state => { setLoad(state); callbacks.current.onLoad?.(state); }, onSelect: selection => callbacks.current.onSelect?.(selection), onError: err => { if (err.name !== IMAGE_LOAD_ERROR) setError(err.message); callbacks.current.onError?.(err); } }); unregister = slot?.register(renderer); callbacks.current.onReady?.(renderer); }
    catch (err) { renderer?.dispose(); renderer = undefined; const error = err instanceof Error ? err : new Error(String(err)); setError(error.message); callbacks.current.onError?.(error); }
    return () => { unregister?.(); renderer?.dispose(); };
  }, [store, slot, assets, controllers, instancing, wheelZoom, touchGestures, buildBudget, plugins, reportPointer]);
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
export interface NodeHtmlProps extends NodeHtmlOptions {
  /** The scene node to follow. Changing it moves the same content to the other node. */
  nodeId: string;
  /** Class and style of the box that holds `children`; it is placed per `align` (default: standing over the node). */
  className?: string; style?: CSSProperties;
  children?: ReactNode;
  /** Receives the handle while attached, and null when detached, for example to read `getState()` in tests. */
  onAttach?: (handle: NodeHtmlHandle | null) => void;
}
/**
 * React content shown over a node of the provider's scene, such as a context menu: rendered through a portal into an
 * element that the provider's `SceneCanvas` renderer attaches with `attachHtml`, so it follows the node and the camera
 * every frame. Clicks, hover and the wheel over it stay away from the scene. Renders nothing until a `SceneCanvas` under
 * the provider has mounted, during server rendering, and after the renderer unmounts; a remounted renderer gets the
 * content again. `anchor`, `offset` and `align` update without re-attaching. Needs `react-dom`.
 */
export function NodeHtml({ nodeId, anchor, offset, align, className, style, children, onAttach }: NodeHtmlProps) {
  const renderer = useSceneRenderer(), [element, setElement] = useState<HTMLDivElement | null>(null), handle = useRef<NodeHtmlHandle | null>(null);
  const latest = useRef({ anchor, offset, align, onAttach }); latest.current = { anchor, offset, align, onAttach };
  // The attached element is created in the browser only.
  useEffect(() => { setElement(document.createElement('div')); }, []);
  useEffect(() => {
    if (!renderer || !element) return;
    const attached = renderer.attachHtml(nodeId, element, htmlOptions(latest.current));
    handle.current = attached; latest.current.onAttach?.(attached);
    return () => { attached.remove(); handle.current = null; latest.current.onAttach?.(null); };
  }, [renderer, element, nodeId]);
  // An inline offset array is a new array each render: compare its values.
  const offsetKey = offset?.join(',');
  useEffect(() => { handle.current?.update(htmlOptions(latest.current)); }, [anchor, offsetKey, align]);
  return renderer && element ? createPortal(<div className={className} style={style}>{children}</div>, element) : null;
}
/** The options a `NodeHtml` passes on, without undefined fields. */
const htmlOptions = ({ anchor, offset, align }: NodeHtmlOptions): NodeHtmlOptions => ({ ...(anchor !== undefined ? { anchor } : {}), ...(offset !== undefined ? { offset } : {}), ...(align !== undefined ? { align } : {}) });
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
/** A container without geometry: nodes whose `parentId` names it move, turn and scale with it, and a click on one that is not selectable selects the group. See `GroupNode`. */
export function Group(props: Omit<GroupNode, 'kind'>) { return <Node node={{ ...props, kind: 'group' }} />; }
/** A box, sphere or cylinder standing on its position, colored from `color` or the scene palette. See `ShapeNode`. */
export function Shape(props: Omit<ShapeNode, 'kind'>) { return <Node node={{ ...props, kind: 'shape' }} />; }
/** A polyline: a 1-pixel line, or a tube with `width` in metres. See `LineNode`. */
export function Line(props: Omit<LineNode, 'kind'>) { return <Node node={{ ...props, kind: 'line' }} />; }
/** Text drawn in the scene on a plane, or facing the camera with `billboard`; a canvas texture, not accessible text. See `TextNode`. Named SceneText so it does not shadow the DOM `Text` type. */
export function SceneText(props: Omit<TextNode, 'kind'>) { return <Node node={{ ...props, kind: 'text' }} />; }
/** A picture from `src` on a rectangle of `size` metres, or facing the camera with `billboard`, with a placeholder until it loads. See `ImageNode`. Named SceneImage so it does not shadow the DOM `Image` constructor. */
export function SceneImage(props: Omit<ImageNode, 'kind'>) { return <Node node={{ ...props, kind: 'image' }} />; }
export function EntityLayer<T>({ entities, mapEntity }: { entities: readonly T[]; mapEntity: (entity: T, index: number) => SceneNode }) { return <>{entities.map((entity, index) => { const node = mapEntity(entity, index); return <Node key={node.id} node={node} />; })}</>; }
export function EntityInspector({ children }: { children: (selection: Selection | null) => ReactNode }) { return <>{children(useScene().selection)}</>; }
