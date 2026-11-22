import { MAX_LINE_WIDTH, SHAPE_TYPES } from '@opsorama/core';
import { INSTANCING_MIN_COUNT } from '@opsorama/three';
import type { DocArticle } from './content';

/** Primitives and groups: shape, line and group nodes, motion on shapes and groups, and selection through groups. */
export const primitivesArticle: DocArticle = {
  slug: 'primitives', title: 'Primitives and groups', category: 'FOUNDATIONS',
  description: 'Build scene content without catalog models: box, sphere and cylinder shapes, lines and tubes, and groups that move, turn, scale and select the nodes inside them, in plain JavaScript, React and Vue.',
  sections: [
    { id: 'when', title: 'Shapes or catalog objects', paragraphs: [
      'Use a catalog asset when the scene shows a real thing (a forklift, a rack, a person): it has a recognizable model, palette roles, anchors, counts and built-in animation. Use shapes, lines and groups for abstract or data-driven content that no model represents: chart bars, value columns, simple markers of your own, connections between objects, and quick placeholders. Both kinds mix freely in one scene, and shapes, lines and groups need no entry in the asset registry.',
    ] },
    { id: 'shapes', title: 'Shape nodes', paragraphs: [
      `A shape node (kind: 'shape') draws one of ${SHAPE_TYPES.join(', ')}: { type: 'box', size: [width, height, depth] }, { type: 'sphere', radius } or { type: 'cylinder', radiusTop, radiusBottom, height }, all in metres. One cylinder radius may be 0 for a cone, not both. A shape stands on its origin: its bottom centre is the node position, so a bar of height h at y = 0 rises from the floor, and a sphere's centre is one radius above its position. Rotate it with rotation (a rotation of π about x turns it over its base). Its label sits 0.3 m above its top.`,
      'Without color a shape takes the scene palette: the palette role of its state for busy, warning, critical and inactive, and the accent role otherwise, each with a theme default. A theme or palette change rebuilds it. opacity from 0 to 1 (default 1) makes it transparent; a transparent shape casts no shadow, is not covered by the glow selection style and is never instanced.',
      `Every box, every sphere and every cylinder with the same radius ratio uses the same unit geometry, scaled to size on its mesh. Equal geometry means the renderer's automatic instancing draws ${INSTANCING_MIN_COUNT} or more of them as one batch, whatever their size and color, so a chart with hundreds of bars costs a few draw calls. getDiagnostics() reports instanceBatches and instances.`,
    ], code: `store.upsert({
  id: 'bar-north-jan', kind: 'shape', parentId: 'series-north',
  position: [1.4, 0, 0], shape: { type: 'box', size: [0.8, value * 0.06, 0.8] },
  color: '#4f7fd8',
});
store.upsert({ id: 'beacon', kind: 'shape', shape: { type: 'sphere', radius: 0.2 }, state: 'critical' });
store.upsert({ id: 'cone', kind: 'shape', shape: { type: 'cylinder', radiusTop: 0, radiusBottom: 0.3, height: 0.6 }, opacity: 0.6 });`, language: 'typescript' },
    { id: 'lines', title: 'Line nodes', paragraphs: [
      `A line node (kind: 'line') draws a polyline through two or more points in its local coordinates: position, rotation and scale apply, and with parentId the container's coordinates. width is a tube diameter in metres from 0 to ${MAX_LINE_WIDTH}. With width 0 (default) the line is 1 pixel wide at every zoom and the pointer passes through it: it is never hit by pointer events or selection. With a width greater than 0 it is a lit tube with round inner corners that pointer events and selection hit, like a shape.`,
      'dashed: true draws dashes in both forms: 0.3 m dashes and 0.2 m gaps for a 1-pixel line; for a tube the dash is at least three times and the gap at least twice its width. Without color a line takes the palette structure role. Its label sits 0.3 m above its origin, so place the origin where the label belongs and give the points relative to it.',
    ], code: `store.upsert({
  id: 'trend-north', kind: 'line', parentId: 'series-north', width: 0.06, color: '#4f7fd8',
  points: values.map((value, column) => [1.4 + column * 1.6, value * 0.06 + 0.12, 0]),
});
store.upsert({ id: 'target', kind: 'line', position: [0, 4.2, -1], points: [[0, 0, 0], [10, 0, 0]], dashed: true, label: 'Target 70' });`, language: 'typescript' },
    { id: 'groups', title: 'Groups', paragraphs: [
      "A group node (kind: 'group') has no geometry. Nodes whose parentId names it use its local coordinates, so moving, turning or scaling the group moves its contents together. Groups nest, and a group can sit inside an asset container. Unlike an asset container, a group is always open: nodeView(group) is 'open', so its children show whenever the group shows, and setNodeView does not apply to it. Only asset and group nodes can be parents; a shape, line or other node named in parentId is a parent-kind error.",
      'Groups do not change the indoor shadow policy: isContained counts only asset containers, so the contents of a top-level group keep their shadows, and a group inside a building makes its contents indoor like any other child of the building.',
      "Selection bubbles through groups. A click on a node that is not selectable selects its nearest selectable group ancestor (one with entityId or selectable), climbing only through group parents: an asset container keeps its own selection. Pointer events still report the node that was hit, with the groups in ancestors. A selected or hovered group is marked around everything inside it, with corner brackets or the glow. selectionTarget(id, getNode) from @opsorama/three applies the same rule in host code.",
    ], code: `store.replace([
  { id: 'chart', kind: 'group', position: [-5.6, 0, -3.4] },
  { id: 'series-north', kind: 'group', parentId: 'chart', label: 'North', entityId: 'series:north' },
  { id: 'bar-north-jan', kind: 'shape', parentId: 'series-north', shape: { type: 'box', size: [0.8, 3, 0.8] } },
]);
// A click on the bar selects series-north (entityId 'series:north'); onPointer still reports bar-north-jan.`, language: 'typescript' },
    { id: 'motion', title: 'Motion on shapes and groups', paragraphs: [
      'route, controller and transfer work on asset, shape and group nodes alike. A group with a route carries everything inside it along the route; a controller (for example the built-in approach or follow, or your own ControllerFactory) receives the group or shape as ControllerContext.node; transfer animates a change of parentId or attachment. route and controller exclude each other, and an attached node owns neither. Line nodes do not move on their own: put them in a group. The agent behaviors (createBehaviorRunner and behaviorNode) still produce asset nodes.',
    ], code: `store.upsert({
  id: 'shuttle', kind: 'group', label: 'Shuttle', selectable: true,
  route: { points: [[-9.5, 0, -6.2], [9.5, 0, -6.2], [9.5, 0, 6.4], [-9.5, 0, 6.4], [-9.5, 0, -6.2]], speed: 2.2, loop: true },
});
store.upsert({ id: 'shuttle-body', kind: 'shape', parentId: 'shuttle', position: [0, 0.2, 0], shape: { type: 'box', size: [0.9, 0.42, 1.5] } });`, language: 'typescript' },
    { id: 'adapters', title: 'React and Vue', paragraphs: [
      'Both adapters export Group, Shape and Line components with the node fields as props, like Ground and Asset. Children are placed with parentId, as with asset containers; the components do not nest. In Vue, shape, opacity, width and dashed are props of the node components (shape also names a marker shape on Marker).',
    ], code: `// React
<Group id="series-north" parentId="chart" label="North" entityId="series:north" />
<Shape id="bar-north-jan" parentId="series-north" shape={{ type: 'box', size: [0.8, 3, 0.8] }} color="#4f7fd8" />
<Line id="trend-north" parentId="series-north" width={0.06} points={[[1.4, 3.1, 0], [3, 2.6, 0]]} />

// Vue
h(Shape, { id: 'bar-north-jan', parentId: 'series-north', shape: { type: 'box', size: [0.8, 3, 0.8] }, opacity: 0.8 })
h(Line, { id: 'target', points: [[0, 4.2, 0], [10, 4.2, 0]], dashed: true })`, language: 'tsx' },
    { id: 'validation', title: 'Validation', paragraphs: [
      'validateScene and the store check the new kinds with the rules shape, opacity, line-points and line-width, plus parent-kind and motion-owner for groups and motion fields. Each problem has a JSON Pointer path and a fix, for example /nodes/4/shape/size with "Set shape.size to [width, height, depth] in metres, each greater than 0". The scene JSON Schema describes ShapeNode, LineNode and GroupNode with their ranges.',
    ] },
    { id: 'example', title: 'Live example', paragraphs: [
      'The live example at /examples/primitives builds a 3D bar chart from box shapes in one group per series, with tube trend lines, a dashed target line, a translucent target band and a cone over the highest bar. New data updates only the changed nodes, a click on a bar selects its series, and a shuttle group of shapes drives around the chart on a route, in React, Vue and plain JavaScript.',
    ] },
  ],
};
