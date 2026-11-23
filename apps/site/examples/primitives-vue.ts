import { createApp, h, shallowRef } from 'vue';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { DashboardProvider, Ground, Group, Line, SceneCanvas, SceneImage, SceneText, Shape } from '@opsorama/vue';
import { brandImage, chartFrame, chartGroup, chartTitle, floor, makePrimitivesStore, monthLabels, noAssets, peakMarker, SERIES, seriesGroup, shuttleGroup, shuttleParts, barNode, trendLine, valueLabel, type ChartData, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** Props of a node for its Vue component, with key; Vue's array props take mutable copies of the frozen vectors. */
const props = (node: SceneNode): { id: string; [key: string]: unknown } => ({ ...node, key: node.id, position: node.position && [...node.position], rotation: node.rotation && [...node.rotation], scale: node.scale && [...node.scale], ...('points' in node ? { points: node.points.map(point => [...point]) } : {}), ...(node.kind === 'image' ? { size: [...node.size] } : {}) });
/** The component for a group, shape or line node; the example has no other kinds in the chart frame. */
const primitive = (node: SceneNode) => h(node.kind === 'group' ? Group : node.kind === 'line' ? Line : Shape, props(node));

/** Native Vue: `Ground`, `Group`, `Shape`, `Line`, `SceneText` and `SceneImage` under one `DashboardProvider`; new data re-renders the chart. */
export function mountPrimitivesVue(container: HTMLElement, settings: Partial<SceneSettings>, initial: ChartData, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore({ schemaVersion: 1, nodes: [] }, settings), data = shallowRef(initial);
  const chart = () => [
    h(Group, props(chartGroup)), ...chartFrame.map(primitive), h(SceneText, props(chartTitle)), ...monthLabels.map(label => h(SceneText, props(label))),
    ...SERIES.map((series, row) => h(Group, props(seriesGroup(series, row)))),
    ...SERIES.flatMap((series, row) => data.value.values[row].map((value, column) => h(Shape, props(barNode(series, column, value))))),
    ...SERIES.map((series, row) => h(Line, props(trendLine(series, data.value.values[row])))),
    ...(data.value.labels ? SERIES.flatMap((series, row) => data.value.values[row].map((value, column) => h(SceneText, props(valueLabel(series, column, value))))) : []),
    h(Shape, props(peakMarker(data.value.values))),
  ];
  const shuttle = () => [h(Group, props(shuttleGroup)), ...shuttleParts.map(part => h(Shape, props(part)))];
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => [
    h(SceneCanvas, { assets: noAssets, wheelZoom: true, style: { height: '460px' }, onReady: callbacks.ready, onSelect: callbacks.select, onError: callbacks.error }),
    h(Ground, props(floor)), ...chart(), h(SceneImage, props(brandImage)), ...shuttle(),
  ] }) });
  app.mount(container);
  return { store, setData: next => { data.value = next; }, dispose: () => { app.unmount(); store.dispose(); } };
}
