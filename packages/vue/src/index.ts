import { computed, defineComponent, getCurrentInstance, h, inject, onUpdated, shallowReadonly, toValue, type MaybeRefOrGetter, onMounted, onUnmounted, provide, ref, shallowRef, watch, type InjectionKey, type PropType, type ShallowRef } from 'vue';
import type { CameraView, MarkerIcon, MarkerShape, MarkerSize, MarkerTone, ShapeGeometry, TextAlign, Attachment, AssetOptions, SceneNode, SceneStore, SceneSnapshot, Selection, NodeRoute, CountLayout, NodeView, MaterialOverrides, Footprint, NodeController, NodeTransfer, ControllerRegistry } from '@opsorama/core';
import { createNodePreview, createRendererSlot, IMAGE_LOAD_ERROR, createSceneRenderer, loadingIndicatorAttributes, loadProgress, loadStateText, sampleRendererFps, SCENE_LOADING_CLASSES, SCENE_LOADING_STYLES, validateFrameListener, SCENE_POINTER_EVENT_TYPES, type AssetRegistry, type FrameListenerOptions, type NodePreview as NodePreviewHandle, type RendererPlugin, type RendererSlot, type SceneFrame, type SceneLoadState, type ScenePointerEvent, type SceneRenderer } from '@opsorama/three';
import { ZOOM_RANGE } from '@opsorama/core';
const storeKey: InjectionKey<SceneStore> = Symbol('dashboard-store');
const rendererKey: InjectionKey<{ slot: RendererSlot; renderer: Readonly<ShallowRef<SceneRenderer | null>> }> = Symbol('dashboard-renderer');
/** Provides the scene store to every component below it, and a slot for the renderer of its one `SceneCanvas` (see `useSceneRenderer`). */
export const DashboardProvider = defineComponent({ name: 'DashboardProvider', props: { store: { type: Object as PropType<SceneStore>, required: true } }, setup(props, { slots }) {
  provide(storeKey, props.store);
  const slot = createRendererSlot(), renderer = shallowRef<SceneRenderer | null>(null), stop = slot.subscribe(() => { renderer.value = slot.get(); });
  onUnmounted(stop); provide(rendererKey, { slot, renderer: shallowReadonly(renderer) });
  return () => slots.default?.();
} });
export function useSceneStore(): SceneStore { const store = inject(storeKey); if (!store) throw new Error('A DashboardProvider is required.'); return store; }
/** The renderer of the provider's `SceneCanvas` as a read-only shallow ref: null before it mounts, after it unmounts and during server rendering. Use it for the camera API (`frame`, `overview`, `setCameraView`) from any component under the provider. */
export function useSceneRenderer(): Readonly<ShallowRef<SceneRenderer | null>> { const context = inject(rendererKey, null); if (!context) throw new Error('A DashboardProvider is required.'); return context.renderer; }
/** The current camera view of the provider's renderer, updated at most once per rendered frame while the view changes; null without a mounted renderer. */
export function useCameraView(): Readonly<ShallowRef<CameraView | null>> {
  const renderer = useSceneRenderer(), view = shallowRef<CameraView | null>(null); let stop: (() => void) | undefined;
  onMounted(() => watch(renderer, value => { stop?.(); stop = undefined; view.value = value?.getCameraView() ?? null; if (value) stop = value.onCameraChange(next => { view.value = next; }); }, { immediate: true }));
  onUnmounted(() => stop?.());
  return shallowReadonly(view);
}
/**
 * Calls `listener` from the frame loop of the provider's renderer, like `SceneRenderer.onFrame`: once per rendered frame,
 * or on a fixed simulation step with `options.step`. Subscribes once the component is mounted and a `SceneCanvas` under
 * the provider has mounted, follows a remounted renderer and unsubscribes on unmount; does nothing during server rendering.
 * `options` may be a ref or getter: a change of `step` or `maxSteps` resubscribes (a fixed-step listener then starts a
 * new scene time). Throws an actionable error for invalid options.
 */
export function useSceneFrame(listener: (frame: SceneFrame) => void, options: MaybeRefOrGetter<FrameListenerOptions> = {}): void {
  validateFrameListener(listener, toValue(options));
  const renderer = useSceneRenderer(); let stop: (() => void) | undefined;
  onMounted(() => watch(() => { const { step, maxSteps } = toValue(options); return [renderer.value, step, maxSteps] as const; }, ([value, step, maxSteps]) => {
    stop?.(); stop = undefined;
    if (value) stop = value.onFrame(listener, { ...(step !== undefined ? { step } : {}), ...(maxSteps !== undefined ? { maxSteps } : {}) });
  }, { immediate: true }));
  onUnmounted(() => { stop?.(); stop = undefined; });
}
export function useScene() { const store = useSceneStore(); const snapshot = shallowRef<SceneSnapshot>(store.getSnapshot()); const unsubscribe = store.subscribe(() => { snapshot.value = store.getSnapshot(); }); onUnmounted(unsubscribe); return snapshot; }
/** Controlled ZoomControl options bound to the provider's scene zoom setting. */
export function useSceneZoom() { const store = useSceneStore(), snapshot = useScene(); return computed<SceneZoom>(() => ({ value: snapshot.value.settings.zoom, min: ZOOM_RANGE.min, max: ZOOM_RANGE.max, onChange: zoom => store.configure({ zoom }) })); }
export interface SceneZoom { value: number; min: number; max: number; onChange(value: number): void; }
/** Rendered frames per second of a mounted renderer, sampled once per second in the browser; null while unknown. */
export function useRendererFps(renderer: MaybeRefOrGetter<SceneRenderer | null | undefined>, enabled: MaybeRefOrGetter<boolean> = true) {
  const fps = ref<number | null>(null); let stop: (() => void) | undefined;
  onMounted(() => watch(() => toValue(enabled), active => {
    stop?.(); stop = undefined; fps.value = null;
    if (active) stop = sampleRendererFps(() => toValue(renderer) ?? null, value => { fps.value = value; });
  }, { immediate: true }));
  onUnmounted(() => stop?.());
  return fps;
}
export const SceneCanvas = defineComponent({
  name: 'SceneCanvas', inheritAttrs: false, props: { assets: { type: Object as PropType<AssetRegistry>, required: true }, controllers: Object as PropType<ControllerRegistry>, instancing: { type: Boolean, default: true }, wheelZoom: { type: Boolean, default: false }, /** Touch pans, pinch-zooms and (with orbit controls) turns the view; see `RendererOptions.touchGestures`. Default false: touch scrolls the page. Mount-time. */ touchGestures: { type: Boolean, default: false }, /** Milliseconds of model building per slice of the initial load; see `RendererOptions.buildBudget`. Mount-time. */ buildBudget: Number, /** Renderer plugins; see `RendererOptions.plugins`. Mount-time: a new array remounts the renderer, so keep it stable. */ plugins: Array as PropType<readonly RendererPlugin[]>, /** Show the loading indicator until the first frame. The `loading` slot, given `{ state }`, replaces its content. */ loading: { type: Boolean, default: true } }, emits: { /** Pointer events on the scene; see `RendererOptions.onPointer`. A `click` listener may call `event.preventSelection()`. The renderer reports pointer events only when a `pointer` listener was bound when it mounted, so a scene without one does no pointer reporting work; the first listener bound after such a mount remounts the renderer once. */ pointer: (event: ScenePointerEvent) => (SCENE_POINTER_EVENT_TYPES as readonly string[]).includes(event?.type) && typeof event.preventSelection === 'function', select: (selection: Selection | null) => selection === null || typeof selection.nodeId === 'string', ready: (renderer: SceneRenderer) => typeof renderer.dispose === 'function', load: (state: SceneLoadState) => typeof state.phase === 'string', error: (error: Error) => error instanceof Error },
  setup(props, { slots, attrs, emit }) {
    const store = useSceneStore(), rendererContext = inject(rendererKey, null), container = ref<HTMLDivElement>(), error = ref<string | null>(null), load = shallowRef<SceneLoadState | null>(null), theme = ref(store.getSnapshot().settings.theme); let renderer: SceneRenderer | undefined, unregister: (() => void) | undefined;
    const unsubscribe = store.subscribe(() => { theme.value = store.getSnapshot().settings.theme; });
    const unmount = () => { unregister?.(); unregister = undefined; renderer?.dispose(); renderer = undefined; };
    // Declared emits never reach `attrs`; a bound `@pointer` listener is an `onPointer` prop of the component's vnode.
    const instance = getCurrentInstance(), hasPointerListener = () => { const props = instance?.vnode.props; return Boolean(props?.onPointer || props?.onPointerOnce); };
    let reportPointer = false;
    const mount = () => { if (!container.value) return; error.value = null; load.value = null; reportPointer = hasPointerListener(); try { renderer = createSceneRenderer(container.value, store, { assets: props.assets, controllers: props.controllers, instancing: props.instancing, wheelZoom: props.wheelZoom, touchGestures: props.touchGestures, buildBudget: props.buildBudget, ...(props.plugins ? { plugins: props.plugins } : {}), loadingIndicator: false, ...(reportPointer ? { onPointer: (event: ScenePointerEvent) => emit('pointer', event) } : {}), onLoad: state => { load.value = state; emit('load', state); }, onSelect: selection => emit('select', selection), onError: err => { if (err.name !== IMAGE_LOAD_ERROR) error.value = err.message; emit('error', err); } }); unregister = rendererContext?.slot.register(renderer); emit('ready', renderer); } catch (err) { unmount(); const failure = err instanceof Error ? err : new Error(String(err)); error.value = failure.message; emit('error', failure); } };
    let stop: (() => void) | undefined;
    onMounted(() => { mount(); stop = watch(() => [props.instancing, props.wheelZoom, props.touchGestures, props.buildBudget, props.plugins], () => { unmount(); mount(); }); });
    // Adding a listener changes the vnode's props, so the component updates; the first one after a mount without one remounts.
    onUpdated(() => { if (renderer && !reportPointer && hasPointerListener()) { unmount(); mount(); } });
    onUnmounted(() => { stop?.(); unsubscribe(); unmount(); });
    const defaultLoading = (state: SceneLoadState | null) => [h('span', { class: SCENE_LOADING_CLASSES.spinner, 'aria-hidden': 'true' }), h('span', { class: SCENE_LOADING_CLASSES.title, 'aria-hidden': 'true' }, 'Loading scene'), h('span', { class: SCENE_LOADING_CLASSES.bar, 'aria-hidden': 'true' }, [h('span', { style: { transform: `scaleX(${loadProgress(state)})` } })]), h('span', { class: SCENE_LOADING_CLASSES.detail, 'aria-hidden': 'true' }, loadStateText(state))];
    const indicator = () => props.loading && !error.value && load.value?.phase !== 'loaded' ? h('div', { class: SCENE_LOADING_CLASSES.root, 'data-theme': theme.value, ...loadingIndicatorAttributes(load.value) }, [h('style', SCENE_LOADING_STYLES), ...(slots.loading?.({ state: load.value }) ?? defaultLoading(load.value))]) : null;
    return () => h('div', { ...attrs, style: [{ position: 'relative', width: '100%', height: '100%', minHeight: '240px' }, attrs.style || {}] }, [h('div', { ref: container, style: { position: 'absolute', inset: 0 } }), slots.default?.(), indicator(), error.value ? h('div', { class: 'kit-scene-error', role: 'alert' }, [h('strong', 'Scene unavailable'), h('p', error.value), h('span', 'Use the HTML record list to continue working.')]) : null]);
  },
});
/** A live copy of a node from the provider's scene in its own canvas, for an inspector; see `createNodePreview`. Size it with a class or style; the default height is 160 px. `assets`, `spin` and `maxNodes` are mount-time. */
export const NodePreview = defineComponent({
  name: 'NodePreview', inheritAttrs: false, props: { /** The scene node to copy, or null for an empty preview. */ nodeId: { type: String as PropType<string | null>, default: null }, assets: { type: Object as PropType<AssetRegistry>, required: true }, /** Turntable speed in radians per second; see `NodePreviewOptions.spin`. */ spin: Number, /** See `NodePreviewOptions.maxNodes`. */ maxNodes: Number }, emits: { ready: (preview: NodePreviewHandle) => typeof preview.dispose === 'function', error: (error: Error) => error instanceof Error },
  setup(props, { attrs, emit }) {
    const store = useSceneStore(), container = ref<HTMLDivElement>(), error = ref<string | null>(null); let preview: NodePreviewHandle | undefined, stop: (() => void) | undefined;
    const mount = () => { if (!container.value) return; error.value = null; try { preview = createNodePreview(container.value, store, { assets: props.assets, spin: props.spin, maxNodes: props.maxNodes, nodeId: props.nodeId, onError: err => { error.value = err.message; emit('error', err); } }); emit('ready', preview); } catch (err) { const failure = err instanceof Error ? err : new Error(String(err)); error.value = failure.message; emit('error', failure); } };
    onMounted(() => { mount(); stop = watch(() => [props.assets, props.spin, props.maxNodes], () => { preview?.dispose(); mount(); }); });
    watch(() => props.nodeId, id => { error.value = null; preview?.setNode(id); });
    onUnmounted(() => { stop?.(); preview?.dispose(); });
    return () => h('div', { ...attrs, style: [{ position: 'relative', width: '100%', height: '160px' }, attrs.style || {}] }, [h('div', { ref: container, style: { position: 'absolute', inset: 0 } }), error.value ? h('div', { class: 'kit-scene-error', role: 'alert' }, [h('strong', 'Preview unavailable'), h('p', error.value)]) : null]);
  },
});
export const SceneElement = defineComponent({ name: 'SceneElement', props: { node: { type: Object as PropType<SceneNode>, required: true } }, setup(props) { const store = useSceneStore(); let id: string | undefined; watch(() => props.node, node => { if (id && id !== node.id) store.remove(id); store.upsert(node); id = node.id; }, { immediate: true, deep: true }); onUnmounted(() => { if (id) store.remove(id); }); return () => null; } });
function nodeComponent(kind: SceneNode['kind'], name = kind[0].toUpperCase() + kind.slice(1)) {
  return defineComponent({ name, inheritAttrs: false, props: { id: { type: String, required: true }, parentId: String, attachment: Object as PropType<Attachment>, materials: Object as PropType<MaterialOverrides>, options: Object as PropType<AssetOptions>, view: String as PropType<NodeView>, peekOnHover: { type: Boolean, default: undefined }, position: Array, /** [width, depth] for grounds and zones, [width, height] for images, capital-letter height in metres for text. */ size: [Array, Number] as PropType<readonly number[] | number>, points: Array, asset: String, localMotion: { type: Boolean, default: undefined }, interior: { type: Boolean, default: undefined }, variant: String, count: Number, countLayout: String as PropType<CountLayout>, multiplier: Number, footprint: Array as unknown as PropType<Footprint>, route: Object as PropType<NodeRoute>, controller: Object as PropType<NodeController>, transfer: Object as PropType<NodeTransfer>, label: String, labelMode: String, color: String, /** Marker shape name for markers; the geometry object for shapes. */ shape: [String, Object] as PropType<MarkerShape | ShapeGeometry>, opacity: Number, width: Number, dashed: { type: Boolean, default: undefined }, text: String, src: String, billboard: { type: Boolean, default: undefined }, align: String as PropType<TextAlign>, tone: String as PropType<MarkerTone>, icon: [String, Object] as PropType<MarkerIcon>, markerSize: String as PropType<MarkerSize>, eyebrow: String, detail: String, pulse: { type: Boolean, default: undefined }, entityId: String, state: String, rotation: Array, scale: Array, selectable: Boolean }, setup(props) { return () => h(SceneElement, { node: { ...props, kind } as SceneNode }); } });
}
export const Ground = nodeComponent('ground'), Zone = nodeComponent('zone'), Asset = nodeComponent('asset'), Path = nodeComponent('path');
/** A projected HTML marker without geometry, such as an alert. See `MarkerFields` in @opsorama/core. */
export const Marker = nodeComponent('marker');
/** A container without geometry: nodes whose `parentId` names it move, turn and scale with it, and a click on one that is not selectable selects the group. See `GroupNode` in @opsorama/core. */
export const Group = nodeComponent('group');
/** A box, sphere or cylinder standing on its position, colored from `color` or the scene palette. See `ShapeNode` in @opsorama/core. */
export const Shape = nodeComponent('shape');
/** A polyline: a 1-pixel line, or a tube with `width` in metres. See `LineNode` in @opsorama/core. */
export const Line = nodeComponent('line');
/** Text drawn in the scene on a plane, or facing the camera with `billboard`; a canvas texture, not accessible text. See `TextNode` in @opsorama/core. */
export const SceneText = nodeComponent('text', 'SceneText');
/** A picture from `src` on a rectangle of `size` metres, or facing the camera with `billboard`, with a placeholder until it loads. See `ImageNode` in @opsorama/core. */
export const SceneImage = nodeComponent('image', 'SceneImage');
export const EntityLayer = defineComponent({ name: 'EntityLayer', props: { nodes: { type: Array as PropType<readonly SceneNode[]>, required: true } }, setup(props) { return () => props.nodes.map(node => h(SceneElement, { key: node.id, node })); } });
export const EntityInspector = defineComponent({ name: 'EntityInspector', setup(_, { slots }) { const snapshot = useScene(); return () => slots.default?.({ selection: snapshot.value.selection }); } });
