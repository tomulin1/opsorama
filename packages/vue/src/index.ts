import { computed, defineComponent, h, inject, toValue, type MaybeRefOrGetter, onMounted, onUnmounted, provide, ref, shallowRef, watch, type InjectionKey, type PropType } from 'vue';
import type { MarkerIcon, MarkerShape, MarkerSize, MarkerTone, ContainerContents, Attachment, SceneNode, SceneStore, SceneSnapshot, Selection, DisplayReading, SurfaceLabel, Measurement, NodeRoute, CountLayout, BuildingOptions, PersonOptions, MaterialOverrides, Footprint, NodeController, NodeTransfer, ForkMotion, ControllerRegistry } from '@opsorama/core';
import { createSceneRenderer, sampleRendererFps, type AssetRegistry, type SceneRenderer } from '@opsorama/three';
import { ZOOM_RANGE } from '@opsorama/core';
const storeKey: InjectionKey<SceneStore> = Symbol('dashboard-store');
export const DashboardProvider = defineComponent({ name: 'DashboardProvider', props: { store: { type: Object as PropType<SceneStore>, required: true } }, setup(props, { slots }) { provide(storeKey, props.store); return () => slots.default?.(); } });
export function useSceneStore(): SceneStore { const store = inject(storeKey); if (!store) throw new Error('A DashboardProvider is required.'); return store; }
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
  name: 'SceneCanvas', inheritAttrs: false, props: { assets: { type: Object as PropType<AssetRegistry>, required: true }, controllers: Object as PropType<ControllerRegistry>, instancing: { type: Boolean, default: true }, wheelZoom: { type: Boolean, default: false } }, emits: { select: (selection: Selection | null) => selection === null || typeof selection.nodeId === 'string', ready: (renderer: SceneRenderer) => typeof renderer.dispose === 'function', error: (error: Error) => error instanceof Error },
  setup(props, { slots, attrs, emit }) {
    const store = useSceneStore(), container = ref<HTMLDivElement>(), error = ref<string | null>(null); let renderer: SceneRenderer | undefined;
    const mount = () => { if (!container.value) return; error.value = null; try { renderer = createSceneRenderer(container.value, store, { assets: props.assets, controllers: props.controllers, instancing: props.instancing, wheelZoom: props.wheelZoom, onSelect: selection => emit('select', selection), onError: err => { error.value = err.message; emit('error', err); } }); emit('ready', renderer); } catch (err) { const failure = err instanceof Error ? err : new Error(String(err)); error.value = failure.message; emit('error', failure); } };
    let stop: (() => void) | undefined;
    onMounted(() => { mount(); stop = watch(() => [props.instancing, props.wheelZoom], () => { renderer?.dispose(); mount(); }); });
    onUnmounted(() => { stop?.(); renderer?.dispose(); });
    return () => h('div', { ...attrs, style: [{ position: 'relative', width: '100%', height: '100%', minHeight: '240px' }, attrs.style || {}] }, [h('div', { ref: container, style: { position: 'absolute', inset: 0 } }), slots.default?.(), error.value ? h('div', { class: 'kit-scene-error', role: 'alert' }, [h('strong', 'Scene unavailable'), h('p', error.value), h('span', 'Use the HTML record list to continue working.')]) : null]);
  },
});
export const SceneElement = defineComponent({ name: 'SceneElement', props: { node: { type: Object as PropType<SceneNode>, required: true } }, setup(props) { const store = useSceneStore(); let id: string | undefined; watch(() => props.node, node => { if (id && id !== node.id) store.remove(id); store.upsert(node); id = node.id; }, { immediate: true, deep: true }); onUnmounted(() => { if (id) store.remove(id); }); return () => null; } });
function nodeComponent(kind: SceneNode['kind']) {
  return defineComponent({ name: kind[0].toUpperCase() + kind.slice(1), inheritAttrs: false, props: { id: { type: String, required: true }, parentId: String, attachment: Object as PropType<Attachment>, contents: Object as PropType<ContainerContents>, materials: Object as PropType<MaterialOverrides>, building: Object as PropType<BuildingOptions>, person: Object as PropType<PersonOptions>, position: Array, size: Array, points: Array, asset: String, localMotion: { type: Boolean, default: undefined }, interior: { type: Boolean, default: undefined }, heatEnabled: { type: Boolean, default: undefined }, waterRunning: { type: Boolean, default: undefined }, fillLevel: Number, variant: String, count: Number, countLayout: String as PropType<CountLayout>, multiplier: Number, surfaceLabel: Object as PropType<SurfaceLabel>, display: Object as PropType<DisplayReading>, footprint: Array as unknown as PropType<Footprint>, measurement: Object as PropType<Measurement>, route: Object as PropType<NodeRoute>, controller: Object as PropType<NodeController>, transfer: Object as PropType<NodeTransfer>, forks: Object as PropType<ForkMotion>, label: String, labelMode: String, color: String, shape: String as PropType<MarkerShape>, tone: String as PropType<MarkerTone>, icon: [String, Object] as PropType<MarkerIcon>, markerSize: String as PropType<MarkerSize>, eyebrow: String, detail: String, pulse: { type: Boolean, default: undefined }, entityId: String, state: String, rotation: Array, scale: Array, selectable: Boolean }, setup(props) { return () => h(SceneElement, { node: { ...props, kind } as SceneNode }); } });
}
export const Ground = nodeComponent('ground'), Zone = nodeComponent('zone'), Asset = nodeComponent('asset'), Path = nodeComponent('path');
/** A projected HTML marker without geometry, such as an alert. See `MarkerFields` in @opsorama/core. */
export const Marker = nodeComponent('marker');
export const EntityLayer = defineComponent({ name: 'EntityLayer', props: { nodes: { type: Array as PropType<readonly SceneNode[]>, required: true } }, setup(props) { return () => props.nodes.map(node => h(SceneElement, { key: node.id, node })); } });
export const EntityInspector = defineComponent({ name: 'EntityInspector', setup(_, { slots }) { const snapshot = useScene(); return () => slots.default?.({ selection: snapshot.value.selection }); } });
