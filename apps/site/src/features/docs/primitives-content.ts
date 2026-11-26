import { DEFAULT_TEXT_SIZE, MAX_IMAGE_SIZE, MAX_LINE_WIDTH, MAX_TEXT_LENGTH, SHAPE_TYPES, TEXT_SIZE_RANGE } from '@opsorama/core';
import { IMAGE_LOAD_ERROR, INSTANCING_MIN_COUNT } from '@opsorama/three';
import type { DocArticle } from './content';

/** Primitives and groups: shape, line, text, image and group nodes, motion on shapes and groups, and selection through groups. */
export const primitivesArticle: DocArticle = {
  slug: 'primitives', title: 'Primitives and groups', category: 'FOUNDATIONS',
  description: 'Build scene content without catalog models: box, sphere and cylinder shapes, lines and tubes, text and images (flat or facing the camera), and groups that move, turn, scale and select the nodes inside them, in plain JavaScript, React and Vue.',
  sections: [
    { id: 'when', title: 'Shapes or catalog objects', paragraphs: [
      'Use a catalog asset when the scene shows a real thing (a forklift, a rack, a person): it has a recognizable model, palette roles, anchors, counts and built-in animation. Use shapes, lines, text, images and groups for abstract or data-driven content that no model represents: chart bars, value columns, value labels, signs and logos, simple markers of your own, connections between objects, and quick placeholders. Both kinds mix freely in one scene, and these primitives need no entry in the asset registry.',
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
    { id: 'text', title: 'Text nodes', paragraphs: [
      `A text node (kind: 'text') draws 1 to ${MAX_TEXT_LENGTH} characters in the scene. size is the height of capital letters in metres, from ${TEXT_SIZE_RANGE.min} to ${TEXT_SIZE_RANGE.max} (default ${DEFAULT_TEXT_SIZE}); \\n starts a new line, 1.75 capital heights below the previous one, and there is no automatic wrapping. The bottom of the text block sits on the node origin, and align (left, center by default, or right) puts the origin at the text's left end, middle or right end and aligns the lines.`,
      'Without billboard the text lies in the node\'s local x-y plane and faces +z; rotation turns it, so rotation: [-Math.PI / 2, 0, 0] lays it flat on the floor, reading from the default camera. From behind it reads mirrored. With billboard: true it is a sprite that always faces the camera, keeps its size in metres and ignores rotation, which suits value labels over bars.',
      'The renderer draws the text into a canvas texture with the system font stack and weight of the projected labels, so no font files load and the text scales with the scene like any object. Text nodes with the same text, color and alignment share one texture, released with the last of them. Without color the text takes the palette text role, else the theme text color. Text is unlit and transparent: it casts no shadow, is not covered by the glow selection style and is never instanced. Pointer events and selection hit its whole rectangle, and a click on text that is not selectable selects its nearest selectable group, like any node.',
      'Canvas text is not accessible text: screen readers do not read it and it cannot be selected or translated by the browser. Show information that users must read in HTML as well, through label (a projected, focusable HTML label), the host\'s own panels or an EntityInspector.',
    ], code: `store.upsert({
  id: 'value-north-jan', kind: 'text', parentId: 'series-north', text: String(value),
  position: [1.4, value * 0.06 + 0.35, 0], size: 0.26, billboard: true,
});
store.upsert({
  id: 'chart-title', kind: 'text', text: 'Monthly volume by region', align: 'left',
  position: [-5.6, 0.02, 4], rotation: [-Math.PI / 2, 0, 0], size: 0.42,
});`, language: 'typescript' },
    { id: 'images', title: 'Image nodes', paragraphs: [
      `An image node (kind: 'image') shows the picture at src on a rectangle of size: [width, height] in metres, each greater than 0 and at most ${MAX_IMAGE_SIZE}. The picture is stretched to fill it, so give size the image's aspect ratio. The bottom edge's centre sits on the node origin. Like text, an image lies in the node's x-y plane facing +z, or with billboard: true faces the camera.`,
      'src is a relative URL (such as /brand/logo.png), an http:, https: or blob: URL, or a data:image/ URL, at most 1,000,000 characters. Other schemes (javascript:, file:, data: URLs that are not images), control characters and surrounding spaces are rejected by validateScene and the store with the image-src rule. Prefer PNG, JPEG or WebP; an SVG needs width and height attributes to load in every browser.',
      `The renderer loads the image in the background and shows a neutral placeholder until it arrives; image nodes with the same src share one load and one texture. A node removed or changed before its image arrives never receives it, and a load nobody needs any more is cancelled. When the image cannot load, the node keeps its placeholder and onError receives an error whose name is ${IMAGE_LOAD_ERROR} and whose message names the node and the URL. The React and Vue SceneCanvas pass it to their error callback without covering the scene, which keeps working.`,
      'Cross-origin images: images load with crossOrigin "anonymous", because WebGL may only draw images the page is allowed to read. An image on another origin (a CDN, an object store) loads only when its server sends Access-Control-Allow-Origin for your site (or *); without it the browser blocks it and the node reports the error. Same-origin, data: and blob: URLs need no header. Images are transparent where the picture is, cast no shadow, are not covered by the glow selection style and are never instanced. An image is not accessible content: describe what it shows in label or host HTML when it matters.',
    ], code: `store.upsert({
  id: 'dock-sign', kind: 'image', src: '/images/dock-sign.png', size: [2, 1],
  position: [6, 0, -3], billboard: true, label: 'Dock 4',
});
createSceneRenderer(container, store, {
  assets: {},
  onError: error => { if (error.name === IMAGE_LOAD_ERROR) console.warn(error.message); },
});`, language: 'typescript' },
    { id: 'groups', title: 'Groups', paragraphs: [
      "A group node (kind: 'group') has no geometry. Nodes whose parentId names it use its local coordinates, so moving, turning or scaling the group moves its contents together. Groups nest, and a group can sit inside an asset container. Unlike an asset container, a group is always open: nodeView(group) is 'open', so its children show whenever the group shows, and setNodeView does not apply to it. Only asset and group nodes can be parents; a shape, line or other node named in parentId is a parent-kind error.",
      'Groups do not change the indoor shadow policy: isContained counts only asset containers, so the contents of a top-level group keep their shadows, and a group inside a building makes its contents indoor like any other child of the building.',
      "Selection bubbles through groups. A click on a node that is not selectable selects its nearest selectable group ancestor (one with entityId or selectable: true, and not selectable: false), climbing only through group parents: an asset container keeps its own selection. selectable: false keeps a node with an entityId out of selection by click or label, for example a floor area whose records a panel shows; store.select still selects it. Floors, zones and grounds without entityId or selectable: true never take a click; isSelectableNode applies the rule in host code. Pointer events still report the node that was hit, with the groups in ancestors. A selected or hovered group is marked around everything inside it, with corner brackets or the glow. selectionTarget(id, getNode) from @opsorama/three applies the same rule in host code.",
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
      'Both adapters export Group, Shape, Line, SceneText and SceneImage components with the node fields as props, like Ground and Asset. SceneText and SceneImage carry the Scene prefix so they do not shadow the DOM Text and Image globals. Children are placed with parentId, as with asset containers; the components do not nest. In Vue, shape, opacity, width, dashed, text, src, billboard and align are props of the node components (shape also names a marker shape on Marker), and size takes [width, depth] for grounds and zones, [width, height] for images and a number for text.',
    ], code: `// React
<Group id="series-north" parentId="chart" label="North" entityId="series:north" />
<Shape id="bar-north-jan" parentId="series-north" shape={{ type: 'box', size: [0.8, 3, 0.8] }} color="#4f7fd8" />
<Line id="trend-north" parentId="series-north" width={0.06} points={[[1.4, 3.1, 0], [3, 2.6, 0]]} />
<SceneText id="value-north-jan" parentId="series-north" text="50" position={[1.4, 3.35, 0]} size={0.26} billboard />
<SceneImage id="dock-sign" src="/images/dock-sign.png" size={[2, 1]} position={[6, 0, -3]} billboard />

// Vue
h(Shape, { id: 'bar-north-jan', parentId: 'series-north', shape: { type: 'box', size: [0.8, 3, 0.8] }, opacity: 0.8 })
h(Line, { id: 'target', points: [[0, 4.2, 0], [10, 4.2, 0]], dashed: true })
h(SceneText, { id: 'title', text: 'Monthly volume', size: 0.42, align: 'left', rotation: [-Math.PI / 2, 0, 0] })
h(SceneImage, { id: 'dock-sign', src: '/images/dock-sign.png', size: [2, 1], billboard: true })`, language: 'tsx' },
    { id: 'validation', title: 'Validation', paragraphs: [
      'validateScene and the store check the primitive kinds with the rules shape, opacity, line-points, line-width, text, text-size, image-src and image-size, plus allowed-value for align, parent-kind for containers and motion-owner for motion fields: text and image nodes, like lines, take no route or controller (put them in a group). Each problem has a JSON Pointer path and a fix, for example /nodes/4/shape/size with "Set shape.size to [width, height, depth] in metres, each greater than 0", or /nodes/7/src for an image URL with a javascript: scheme. The scene JSON Schema describes ShapeNode, LineNode, TextNode, ImageNode and GroupNode with their ranges and the same src pattern (IMAGE_SRC_PATTERN).',
    ] },
    { id: 'example', title: 'Live example', paragraphs: [
      'The live example at /examples/primitives builds a 3D bar chart from box shapes in one group per series, with tube trend lines, a dashed target line, a translucent target band, a cone over the highest bar, billboard value labels over the bars, a flat title and month names on the floor, and an image node beside the chart. New data updates only the changed nodes, a click on a bar or its value selects its series, the value labels can be turned off and on while the texture readout returns to its earlier count, and a shuttle group of shapes drives around the chart on a route, in React, Vue and plain JavaScript.',
    ] },
  ],
};
