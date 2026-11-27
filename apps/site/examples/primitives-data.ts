import { createSceneStore, type GroundNode, type GroupNode, type ImageNode, type LineNode, type SceneDefinition, type SceneNode, type SceneSettings, type SceneStore, type Selection, type ShapeNode, type TextNode, type Vec3 } from '@opsorama/core';
import type { AssetRegistry, SceneRenderer } from '@opsorama/three';

/*
 * The primitives example: a 3D bar chart built from shape, line, text and group nodes, driven by data, with billboard
 * value labels over the bars, a flat title on the floor, an image node, and a small shuttle made of shapes in a group that
 * drives around the chart on a route. Values are illustrative, not records.
 */

/** The scene uses no catalog models: shape, line and group nodes need no asset factories. A module constant stays stable across renders. */
export const noAssets: AssetRegistry = Object.freeze({});

/** Columns of the chart. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] as const;
/** Rows of the chart: one group per series. */
export const SERIES = [
  { id: 'north', label: 'North', color: '#4f7fd8' },
  { id: 'central', label: 'Central', color: '#35a184' },
  { id: 'south', label: 'South', color: '#d98b3f' },
] as const;
export type ChartSeries = typeof SERIES[number];
/** Values per series and month, `values[row][column]`, whole numbers from 0 to 100. */
export type ChartValues = readonly (readonly number[])[];
/** Value of the target band across the chart. */
export const TARGET = 70;

/** Metres of bar height per value unit: 100 is 6 m. */
const UNIT = .06;
/** Bar width and depth, column spacing, row spacing and the margin before the first bar, in metres. */
const BAR = .8, COLUMN = 1.6, ROW = 2.4, MARGIN = 1.4;
/** Where the chart group stands; every chart node is placed in its local coordinates. */
export const CHART_ORIGIN: Vec3 = [-5.6, 0, -3.4];
const height = (value: number) => Math.max(.05, value * UNIT);
const columnX = (column: number) => MARGIN + column * COLUMN;

/** Values of data set `seed`: a seeded random walk, so every set is reproducible. Set 0 is the first one shown. */
export function chartValues(seed: number): ChartValues {
  let state = (seed * 2654435761 + 1013904223) >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return SERIES.map(() => { let value = 25 + Math.round(random() * 40); return MONTHS.map(() => { value = Math.max(8, Math.min(98, value + Math.round((random() - .45) * 24))); return value; }); });
}

export const seriesGroupId = (series: ChartSeries) => `series-${series.id}`;
export const barId = (series: ChartSeries, column: number) => `bar-${series.id}-${MONTHS[column].toLowerCase()}`;

/** The chart group: not selectable, so a click on a bar selects the bar's series group. */
export const chartGroup: GroupNode = { id: 'chart', kind: 'group', position: CHART_ORIGIN };
/** One group per series; selectable through its `entityId`. Its label sits at its origin, in front of the row. */
export const seriesGroup = (series: ChartSeries, row: number): GroupNode => ({ id: seriesGroupId(series), kind: 'group', parentId: chartGroup.id, position: [0, 0, row * ROW], label: series.label, entityId: `series:${series.id}` });
/** A bar: a box standing on the floor of its series group. Equal boxes share one unit geometry and draw as one batch. */
export const barNode = (series: ChartSeries, column: number, value: number): ShapeNode => ({ id: barId(series, column), kind: 'shape', parentId: seriesGroupId(series), position: [columnX(column), 0, 0], shape: { type: 'box', size: [BAR, height(value), BAR] }, color: series.color });
/** A trend line through the tops of a series' bars: a tube 6 cm wide, in the series group's coordinates. */
export const trendLine = (series: ChartSeries, values: readonly number[]): LineNode => ({ id: `trend-${series.id}`, kind: 'line', parentId: seriesGroupId(series), points: values.map((value, column) => [columnX(column), height(value) + .12, 0] as Vec3), width: .06, color: series.color });

/** Chart width and depth in metres, for the axes and the target band. */
const WIDTH = MARGIN * 2 + (MONTHS.length - 1) * COLUMN, DEPTH = (SERIES.length - 1) * ROW;
/** Axes and the target: 1-pixel lines (the target line dashed) and a translucent band that is never instanced. */
export const chartFrame: readonly SceneNode[] = [
  { id: 'axis-x', kind: 'line', parentId: chartGroup.id, points: [[0, .02, -1], [WIDTH, .02, -1]], color: '#5a6b84' },
  { id: 'axis-y', kind: 'line', parentId: chartGroup.id, points: [[0, 0, -1], [0, height(100), -1]], color: '#5a6b84' },
  { id: 'target-band', kind: 'shape', parentId: chartGroup.id, position: [WIDTH / 2, height(TARGET) - .02, DEPTH / 2], shape: { type: 'box', size: [WIDTH, .04, DEPTH + 2] }, color: '#d9483b', opacity: .22 },
  // A line's label sits above its origin, so the origin is placed at the line's start.
  { id: 'target-line', kind: 'line', parentId: chartGroup.id, position: [0, height(TARGET), -1], points: [[0, 0, 0], [WIDTH, 0, 0]], color: '#d9483b', dashed: true, label: `Target ${TARGET}` },
];

/** The highest value of a data set and where it is. */
export function peak(values: ChartValues): { row: number; column: number; value: number } {
  let best = { row: 0, column: 0, value: -1 };
  values.forEach((row, rowIndex) => row.forEach((value, column) => { if (value > best.value) best = { row: rowIndex, column, value }; }));
  return best;
}
/**
 * A cone pointing down at the highest bar. It has no `color`, so its `warning` state takes the palette's warning color.
 * A rotation of π about x turns the cone over its base, so it hangs below its position.
 */
export function peakMarker(values: ChartValues): ShapeNode {
  const { row, column, value } = peak(values);
  return { id: 'peak-marker', kind: 'shape', parentId: chartGroup.id, position: [columnX(column), height(value) + 1.2, row * ROW], rotation: [Math.PI, 0, 0], shape: { type: 'cylinder', radiusTop: 0, radiusBottom: .32, height: .6 }, state: 'warning', label: `Peak ${value}`, labelMode: 'always' };
}

export const valueLabelId = (series: ChartSeries, column: number) => `value-${series.id}-${MONTHS[column].toLowerCase()}`;
/**
 * A bar's value: billboard text that faces the camera from every direction, standing 0.35 m above the bar. It has no
 * `color`, so it takes the palette `text` role or the theme's text color. Equal numbers share one texture. The text is a
 * picture in the canvas; the page states the values in HTML as well.
 */
export const valueLabel = (series: ChartSeries, column: number, value: number): TextNode => ({ id: valueLabelId(series, column), kind: 'text', parentId: seriesGroupId(series), position: [columnX(column), height(value) + .35, 0], text: String(value), size: .26, billboard: true });
/** The chart title, flat on the floor in front of the chart: a rotation of −π/2 about x lays the text down, reading from the camera. */
export const chartTitle: TextNode = { id: 'chart-title', kind: 'text', parentId: chartGroup.id, position: [0, .02, DEPTH + 2.6], rotation: [-Math.PI / 2, 0, 0], text: 'Monthly volume by region', size: .42, align: 'left' };
/** Months under the columns, flat on the floor in front of the chart. */
export const monthLabels: readonly TextNode[] = MONTHS.map((month, column) => ({ id: `month-${month.toLowerCase()}`, kind: 'text', parentId: chartGroup.id, position: [columnX(column), .02, DEPTH + 1.4], rotation: [-Math.PI / 2, 0, 0], text: month, size: .3 }));

/** Every chart node for a data set, each group before its children; `labels` adds the value labels over the bars. */
export function chartNodes(values: ChartValues, labels = true): SceneNode[] {
  return [chartGroup, ...chartFrame, chartTitle, ...monthLabels, ...SERIES.flatMap((series, row) => [seriesGroup(series, row), ...values[row].map((value, column) => barNode(series, column, value)), trendLine(series, values[row]), ...(labels ? values[row].map((value, column) => valueLabel(series, column, value)) : [])]), peakMarker(values)];
}

/**
 * An image node: the project mark, a PNG from the site's own public folder (same origin, so no CORS header is needed),
 * standing beside the chart as a billboard. It is selectable, so a click on the picture selects it.
 */
export const brandImage: ImageNode = { id: 'brand-image', kind: 'image', src: '/brand/apple-touch-icon.png', size: [1.6, 1.6], position: [7.4, 0, -2.4], billboard: true, label: 'Image node', selectable: true };

/** The shuttle's loop around the chart: a closed route, so it ends where it starts. */
export const SHUTTLE_ROUTE_POINTS: readonly Vec3[] = [[-9.5, 0, -6.2], [9.5, 0, -6.2], [9.5, 0, 6.4], [-9.5, 0, 6.4], [-9.5, 0, -6.2]];
/** A selectable group with a route: everything inside moves with it, and a click on any part selects the shuttle. */
export const shuttleGroup: GroupNode = { id: 'shuttle', kind: 'group', position: SHUTTLE_ROUTE_POINTS[0], label: 'Shuttle', selectable: true, route: { points: SHUTTLE_ROUTE_POINTS, speed: 2.2, loop: true, profile: { acceleration: 1.2, cornerRadius: 1.2 } } };
/** The shuttle's parts in its local coordinates; +z is its heading. The four wheels are equal cylinders, so they draw as one batch. */
export const shuttleParts: readonly ShapeNode[] = [
  { id: 'shuttle-body', kind: 'shape', parentId: shuttleGroup.id, position: [0, .2, 0], shape: { type: 'box', size: [.9, .42, 1.5] }, color: '#e9eef5' },
  { id: 'shuttle-cab', kind: 'shape', parentId: shuttleGroup.id, position: [0, .62, .38], shape: { type: 'box', size: [.82, .38, .56] }, color: '#3c4b63' },
  ...([[-1, -1], [-1, 1], [1, -1], [1, 1]] as const).map(([side, end], index): ShapeNode => ({ id: `shuttle-wheel-${index + 1}`, kind: 'shape', parentId: shuttleGroup.id, position: [side < 0 ? -.45 : .61, .18, end * .48], rotation: [0, 0, Math.PI / 2], shape: { type: 'cylinder', radiusTop: .18, radiusBottom: .18, height: .16 }, color: '#2a313c' })),
  { id: 'shuttle-beacon', kind: 'shape', parentId: shuttleGroup.id, position: [0, 1, .38], shape: { type: 'sphere', radius: .11 }, color: '#ffc83d' },
];

/** The floor under the chart and the shuttle's loop. */
export const floor: GroundNode = { id: 'floor', kind: 'ground', size: [24, 16], color: '#e6edf5' };
/** The scene of data set `values`, with or without the value labels. */
export const primitivesDefinition = (values: ChartValues = chartValues(0), labels = true): SceneDefinition => ({ schemaVersion: 1, nodes: [floor, ...chartNodes(values, labels), brandImage, shuttleGroup, ...shuttleParts] });
/** The store of one mount. The adapters register the nodes themselves; plain JavaScript passes the whole definition. */
export const makePrimitivesStore = (definition: SceneDefinition, settings: Partial<SceneSettings> = {}): SceneStore => createSceneStore(definition, settings);

/** One line per series with its total, for the page's readout. */
export const valuesSummary = (values: ChartValues) => SERIES.map((series, row) => `${series.label} ${values[row].reduce((sum, value) => sum + value, 0)}`).join(' · ');
/** What the selection is, for the page's readout. */
export const selectionSummary = (selection: Selection | null) => selection ? `Selected: ${selection.nodeId}${selection.entityId ? ` (${selection.entityId})` : ''}` : 'Selected: nothing';

/** What the chart shows: a data set, and whether value labels stand over the bars. */
export interface ChartData { values: ChartValues; labels: boolean }
/** A mount of one adapter: the store, a way to show other data, and disposal of the scene and store. */
export interface PrimitivesSession { store: SceneStore; setData(data: ChartData): void; dispose(): void }
/** Callbacks from a mount to the page; `error` receives the renderer's errors, such as an image that fails to load. */
export interface PrimitivesCallbacks { ready(renderer: SceneRenderer): void; select(selection: Selection | null): void; error(error: Error): void }

/** Copyable snippet of the chart in each adapter. */
export function primitivesSnippet(framework: 'react' | 'vue' | 'javascript'): string {
  if (framework === 'javascript') return `const nodes = [
  { id: 'chart', kind: 'group', position: [-5.6, 0, -3.4] },
  { id: 'series-north', kind: 'group', parentId: 'chart', label: 'North', entityId: 'series:north' },
  ...values.map((value, column) => ({
    id: \`bar-north-\${column}\`, kind: 'shape', parentId: 'series-north', position: [1.4 + column * 1.6, 0, 0],
    shape: { type: 'box', size: [0.8, value * 0.06, 0.8] }, color: '#4f7fd8',
  })),
  { id: 'trend-north', kind: 'line', parentId: 'series-north', width: 0.06, color: '#4f7fd8',
    points: values.map((value, column) => [1.4 + column * 1.6, value * 0.06 + 0.12, 0]) },
  ...values.map((value, column) => ({
    id: \`value-north-\${column}\`, kind: 'text', parentId: 'series-north', text: String(value),
    position: [1.4 + column * 1.6, value * 0.06 + 0.35, 0], size: 0.26, billboard: true,
  })),
  { id: 'brand-image', kind: 'image', src: '/brand/apple-touch-icon.png', size: [1.6, 1.6], position: [7.4, 0, -2.4], billboard: true },
  { id: 'shuttle', kind: 'group', selectable: true, route: { points: loop, speed: 2.2, loop: true } },
  { id: 'shuttle-body', kind: 'shape', parentId: 'shuttle', shape: { type: 'box', size: [0.9, 0.42, 1.5] } },
];
store.replace([floor, ...nodes]); // a new data set: replace or upsert the bars and labels
// Shapes, lines, groups, text and images need no models; onError reports an image that fails to load.
const renderer = createSceneRenderer(container, store, { assets: {}, onError: error => console.warn(error.message) });`;
  if (framework === 'react') return `<DashboardProvider store={store}>
  <SceneCanvas assets={assets} onSelect={setSelection} />
  <Group id="chart" position={[-5.6, 0, -3.4]} />
  <Group id="series-north" parentId="chart" label="North" entityId="series:north" />
  {values.map((value, column) => <Shape key={column} id={\`bar-north-\${column}\`} parentId="series-north"
    position={[1.4 + column * 1.6, 0, 0]} shape={{ type: 'box', size: [0.8, value * 0.06, 0.8] }} color="#4f7fd8" />)}
  <Line id="trend-north" parentId="series-north" width={0.06} color="#4f7fd8"
    points={values.map((value, column) => [1.4 + column * 1.6, value * 0.06 + 0.12, 0])} />
  {values.map((value, column) => <SceneText key={column} id={\`value-north-\${column}\`} parentId="series-north"
    text={String(value)} position={[1.4 + column * 1.6, value * 0.06 + 0.35, 0]} size={0.26} billboard />)}
  <SceneImage id="brand-image" src="/brand/apple-touch-icon.png" size={[1.6, 1.6]} position={[7.4, 0, -2.4]} billboard />
  <Group id="shuttle" selectable route={{ points: loop, speed: 2.2, loop: true }} />
  <Shape id="shuttle-body" parentId="shuttle" shape={{ type: 'box', size: [0.9, 0.42, 1.5] }} />
</DashboardProvider>`;
  return `h(DashboardProvider, { store }, () => [
  h(SceneCanvas, { assets, onSelect }),
  h(Group, { id: 'chart', position: [-5.6, 0, -3.4] }),
  h(Group, { id: 'series-north', parentId: 'chart', label: 'North', entityId: 'series:north' }),
  ...values.value.map((value, column) => h(Shape, { key: column, id: \`bar-north-\${column}\`, parentId: 'series-north',
    position: [1.4 + column * 1.6, 0, 0], shape: { type: 'box', size: [0.8, value * 0.06, 0.8] }, color: '#4f7fd8' })),
  h(Line, { id: 'trend-north', parentId: 'series-north', width: 0.06, color: '#4f7fd8',
    points: values.value.map((value, column) => [1.4 + column * 1.6, value * 0.06 + 0.12, 0]) }),
  ...values.value.map((value, column) => h(SceneText, { key: \`value-\${column}\`, id: \`value-north-\${column}\`, parentId: 'series-north',
    text: String(value), position: [1.4 + column * 1.6, value * 0.06 + 0.35, 0], size: 0.26, billboard: true })),
  h(SceneImage, { id: 'brand-image', src: '/brand/apple-touch-icon.png', size: [1.6, 1.6], position: [7.4, 0, -2.4], billboard: true }),
  h(Group, { id: 'shuttle', selectable: true, route: { points: loop, speed: 2.2, loop: true } }),
  h(Shape, { id: 'shuttle-body', parentId: 'shuttle', shape: { type: 'box', size: [0.9, 0.42, 1.5] } }),
])`;
}
