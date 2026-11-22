import { createRoot } from 'react-dom/client';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { DashboardProvider, Ground, Group, Line, SceneCanvas, Shape } from '@opsorama/react';
import { chartFrame, chartGroup, floor, makePrimitivesStore, noAssets, peakMarker, SERIES, seriesGroup, shuttleGroup, shuttleParts, barNode, trendLine, type ChartValues, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** The component for a group, shape or line node; the example has no other kinds under the chart. */
function Primitive({ node }: { node: SceneNode }) {
  if (node.kind === 'group') return <Group {...node} />;
  if (node.kind === 'shape') return <Shape {...node} />;
  if (node.kind === 'line') return <Line {...node} />;
  return null;
}

/** The chart from data: a group per series with its bars and trend line. New values update only the changed bars. */
function Chart({ values }: { values: ChartValues }) {
  return <>
    <Group {...chartGroup} />
    {chartFrame.map(node => <Primitive key={node.id} node={node} />)}
    {SERIES.map((series, row) => <Group key={series.id} {...seriesGroup(series, row)} />)}
    {SERIES.flatMap((series, row) => values[row].map((value, column) => <Shape key={`${series.id}-${column}`} {...barNode(series, column, value)} />))}
    {SERIES.map((series, row) => <Line key={series.id} {...trendLine(series, values[row])} />)}
    <Shape {...peakMarker(values)} />
  </>;
}

/** The shuttle: a group with a route and its shape parts, placed through `parentId`. */
function Shuttle() {
  return <><Group {...shuttleGroup} />{shuttleParts.map(part => <Shape key={part.id} {...part} />)}</>;
}

/** React: `Ground`, `Group`, `Shape` and `Line` components under one `DashboardProvider`; a new data set re-renders the chart. */
export function mountPrimitivesReact(container: HTMLElement, settings: Partial<SceneSettings>, values: ChartValues, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore({ schemaVersion: 1, nodes: [] }, settings), root = createRoot(container);
  const render = (next: ChartValues) => root.render(<DashboardProvider store={store}>
    <SceneCanvas assets={noAssets} wheelZoom style={{ height: 460 }} onReady={callbacks.ready} onSelect={callbacks.select} />
    <Ground {...floor} />
    <Chart values={next} />
    <Shuttle />
  </DashboardProvider>);
  render(values);
  return { store, setValues: render, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
