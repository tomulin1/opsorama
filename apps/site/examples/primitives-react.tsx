import { createRoot } from 'react-dom/client';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { DashboardProvider, Ground, Group, Line, SceneCanvas, SceneImage, SceneText, Shape } from '@opsorama/react';
import { brandImage, chartFrame, chartGroup, chartTitle, floor, makePrimitivesStore, monthLabels, noAssets, peakMarker, SERIES, seriesGroup, shuttleGroup, shuttleParts, barNode, trendLine, valueLabel, type ChartData, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** The component for a group, shape or line node; the example has no other kinds in the chart frame. */
function Primitive({ node }: { node: SceneNode }) {
  if (node.kind === 'group') return <Group {...node} />;
  if (node.kind === 'shape') return <Shape {...node} />;
  if (node.kind === 'line') return <Line {...node} />;
  return null;
}

/** The chart from data: a group per series with its bars, trend line and value labels. New values update only the changed nodes. */
function Chart({ values, labels }: ChartData) {
  return <>
    <Group {...chartGroup} />
    {chartFrame.map(node => <Primitive key={node.id} node={node} />)}
    <SceneText {...chartTitle} />
    {monthLabels.map(label => <SceneText key={label.id} {...label} />)}
    {SERIES.map((series, row) => <Group key={series.id} {...seriesGroup(series, row)} />)}
    {SERIES.flatMap((series, row) => values[row].map((value, column) => <Shape key={`${series.id}-${column}`} {...barNode(series, column, value)} />))}
    {SERIES.map((series, row) => <Line key={series.id} {...trendLine(series, values[row])} />)}
    {labels && SERIES.flatMap((series, row) => values[row].map((value, column) => <SceneText key={`value-${series.id}-${column}`} {...valueLabel(series, column, value)} />))}
    <Shape {...peakMarker(values)} />
  </>;
}

/** The shuttle: a group with a route and its shape parts, placed through `parentId`. */
function Shuttle() {
  return <><Group {...shuttleGroup} />{shuttleParts.map(part => <Shape key={part.id} {...part} />)}</>;
}

/** React: `Ground`, `Group`, `Shape`, `Line`, `SceneText` and `SceneImage` under one `DashboardProvider`; new data re-renders the chart. */
export function mountPrimitivesReact(container: HTMLElement, settings: Partial<SceneSettings>, data: ChartData, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore({ schemaVersion: 1, nodes: [] }, settings), root = createRoot(container);
  const render = (next: ChartData) => root.render(<DashboardProvider store={store}>
    <SceneCanvas assets={noAssets} wheelZoom style={{ height: 460 }} onReady={callbacks.ready} onSelect={callbacks.select} onError={callbacks.error} />
    <Ground {...floor} />
    <Chart {...next} />
    <SceneImage {...brandImage} />
    <Shuttle />
  </DashboardProvider>);
  render(data);
  return { store, setData: render, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
