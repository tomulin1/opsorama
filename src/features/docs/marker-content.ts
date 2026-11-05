import type { DocArticle } from './content';
export const markerArticle: DocArticle = {
  slug: 'scene-markers', title: 'Scene markers', category: 'COMPONENTS',
  description: 'Alerts, places and status as markers in the scene: a shape in a semantic tone with an icon, and a card with the detail. Markers have no geometry, so they work over any model. The configurator below runs the same marker through React, Vue and plain JavaScript.',
  sections: [
    { id: 'usage', title: 'Usage', paragraphs: ['A marker is a scene node of kind marker. It draws a projected HTML button over the scene and adds nothing to the 3D model. Place it with position, or follow a node with attachment, for example the top anchor of a rack. label is required: it is the card title and part of the accessible name. React and Vue export a Marker component with the same fields; plain JavaScript upserts the node. The renderer brings its own marker styles, so no stylesheet import is needed.'], code: `import { Marker } from '@opsorama/react';   // or '@opsorama/vue'

<Marker id="alert-thermal"
  attachment={{ nodeId: 'rack-a02', anchor: 'top' }}
  tone="critical" icon="thermometer"
  eyebrow="Critical" label="High inlet temperature"
  detail="34.8 °C · policy > 30 °C" selectable />`, language: 'tsx' },
    { id: 'options', title: 'Options', headers: ['Field', 'Default', 'Description'], rows: [
      ['label', 'required', 'Card title and accessible name, 1–120 characters.'],
      ['shape', 'pin', 'pin, circle, square, diamond, triangle, hexagon, octagon or shield. See Shapes.'],
      ['tone', 'from state', 'critical, warning, success, info or neutral. Without a tone, state critical gives critical, warning gives warning, inactive gives neutral and anything else info.'],
      ['icon', 'by tone', 'A built-in icon name, none, or { paths } with up to 8 SVG path strings on a 24 × 24 grid. Defaults: alert for critical and warning, check for success, info otherwise.'],
      ['color', 'tone colour', 'CSS colour replacing the fill. The rim and icon stay white, so keep the contrast.'],
      ['markerSize', 'medium', 'small (24 px wide), medium (32 px) or large (40 px). A pin is 1.25 times as tall as wide. Named apart from a zone size in metres.'],
      ['eyebrow', 'none', 'Small caps line above the title in the card, such as a severity. 1–40 characters.'],
      ['detail', 'none', 'Line under the title, such as a reading. 1–160 characters.'],
      ['pulse', 'true for critical', 'A ring that grows and fades around the shape. See Motion.'],
      ['position, attachment, parentId', 'origin', 'Placement like any node. With attachment the marker follows its carrier and anchor.'],
      ['selectable, entityId', 'none', 'Without either the marker still opens its card on hover and focus, but a click selects nothing.'],
      ['labelMode', 'always', 'active shows the marker only while it is hovered or selected.'],
    ] },
    { id: 'shapes', title: 'Shapes', paragraphs: ['A pin points at its position with its tip, so it suits objects and places. Every other shape is a badge centred on its position. Meanings are conventions; the host chooses.'], headers: ['Shape', 'Anchor', 'Usual meaning'], rows: [
      ['pin', 'tip', 'A place or an object that needs attention'],
      ['circle', 'centre', 'Status or presence'],
      ['square', 'centre', 'Notice or category'],
      ['diamond', 'centre', 'Hazard, as on road warning signs'],
      ['triangle', 'centre', 'Caution'],
      ['hexagon', 'centre', 'System or maintenance'],
      ['octagon', 'centre', 'Stop or blocked'],
      ['shield', 'centre', 'Security or access'],
    ] },
    { id: 'icons', title: 'Icons and tones', paragraphs: ['Built-in icons: alert, info, check, x, thermometer, network, plug, zap, droplet, flame, lock, wrench, clock, wifi-off, package, user and bell. alert and info are plain glyphs; the others are Lucide icons (ISC licence). Icons are drawn as white strokes.', 'Tones read the scene palette, so a scene override recolours every marker: critical uses the critical role, warning the warning role, success the normal role, info the accent role and neutral the inactive role. Without a palette override the built-in colours are #d9483b, #d98a1c, #2f9b74, #4779ed and #6b7a8f. color on the node wins over both.'] },
    { id: 'placement', title: 'Placement and labels', paragraphs: ['A marker keeps its size at every zoom. It is placed before other labels and never moves or hides to avoid them; ordinary labels make way for markers instead. Markers can overlap each other when their positions are close, so give nearby incidents different anchors or merge them into one marker.', 'Hover, keyboard focus and selection open the card above the marker. Near the top edge the card can be cut off by the scene and covered by HUD panels.'] },
    { id: 'motion', title: 'Motion', paragraphs: ['pulse never runs while scene motion is off, the scene is paused or the user prefers reduced motion; pulse: true cannot override that. Without motion a critical marker still reads by its colour, shape and icon.'] },
    { id: 'styling', title: 'Styling', paragraphs: ['The renderer appends one style element to its label layer and removes it on dispose. Rules use one class each: .kit-marker (the button, with data-shape and data-tone), .kit-marker-body, .kit-marker-icon, .kit-marker-pulse, .kit-marker-card, .kit-marker-eyebrow, .kit-marker-title and .kit-marker-detail. A selected marker also has .kit-node-selected. Override with a more specific selector in the host, such as .my-scene .kit-marker-card. The fill colour is the --kit-marker-color custom property on the button.'] },
    { id: 'accessibility', title: 'Accessibility', paragraphs: ['Each marker is a native button named "Select" followed by the eyebrow, label and detail, so the card text is available without hovering. The shape and icon are hidden from assistive technology. Keep an HTML list of the same items, such as an incident queue, for touch and screen reader users.'] },
    { id: 'examples', title: 'Runnable examples', list: [
      'examples/marker-data.ts: the stage, featured marker, gallery row and snippet builder.',
      'examples/marker-react.tsx, examples/marker-vue.ts and examples/marker-javascript.ts: the three native mounts used above.',
      '/examples/datacenter: incident markers on rack anchors.',
    ] },
  ],
};
