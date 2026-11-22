import { createApp, h, shallowRef } from 'vue';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { DashboardProvider, Ground, Group, Line, SceneCanvas, Shape } from '@opsorama/vue';
import { chartFrame, chartGroup, floor, makePrimitivesStore, noAssets, peakMarker, SERIES, seriesGroup, shuttleGroup, shuttleParts, barNode, trendLine, type ChartValues, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** Props of a node for its Vue component, with key; Vue's array props take mutable copies of the frozen vectors. */
const props = (node: SceneNode): { id: string; [key: string]: unknown } => ({ ...node, key: node.id, position: node.position && [...node.position], rotation: node.rotation && [...node.rotation], scale: node.scale && [...node.scale], ...('points' in node ? { points: node.points.map(point => [...point]) } : {}) });
/** The component for a group, shape or line node; the example has no other kinds under the chart. */
const primitive = (node: SceneNode) => h(node.kind === 'group' ? Group : node.kind === 'line' ? Line : Shape, props(node));

/** Native Vue: `Ground`, `Group`, `Shape` and `Line` components under one `DashboardProvider`; a new data set re-renders the chart. */
export function mountPrimitivesVue(container: HTMLElement, settings: Partial<SceneSettings>, values: ChartValues, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore({ schemaVersion: 1, nodes: [] }, settings), data = shallowRef(values);
  const chart = () => [
    h(Group, props(chartGroup)), ...chartFrame.map(primitive),
    ...SERIES.map((series, row) => h(Group, props(seriesGroup(series, row)))),
    ...SERIES.flatMap((series, row) => data.value[row].map((value, column) => h(Shape, props(barNode(series, column, value))))),
    ...SERIES.map((series, row) => h(Line, props(trendLine(series, data.value[row])))),
    h(Shape, props(peakMarker(data.value))),
  ];
  const shuttle = () => [h(Group, props(shuttleGroup)), ...shuttleParts.map(part => h(Shape, props(part)))];
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => [
    h(SceneCanvas, { assets: noAssets, wheelZoom: true, style: { height: '460px' }, onReady: callbacks.ready, onSelect: callbacks.select }),
    h(Ground, props(floor)), ...chart(), ...shuttle(),
  ] }) });
  app.mount(container);
  return { store, setValues: next => { data.value = next; }, dispose: () => { app.unmount(); store.dispose(); } };
}
