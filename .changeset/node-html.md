---
"@opsorama/three": minor
"@opsorama/react": minor
"@opsorama/vue": minor
---

Add HTML over nodes. `SceneRenderer.attachHtml(nodeId, element, { anchor?, offset?, align? })` keeps a host element, such as a context menu, a tooltip or quick actions, over a node: every drawn frame it projects the node's origin or a named model anchor plus an offset in that local space (default: the node's label height) and places the element above, centred on or below the point, writing only changed positions. The element is hidden while the node is unknown, hidden or not built, its anchor is missing or the point is behind the camera; it is drawn above labels and markers, takes pointer input, and keeps clicks, hover and the wheel away from the scene. The returned `NodeHtmlHandle` has `update`, `getState` and `remove` (which restores the inline styles the renderer set); `dispose()` removes every attachment, and invalid input throws an actionable error (`validateNodeHtmlOptions`). React and Vue add `NodeHtml`, which renders its children through a portal or teleport into an attached element under the provider. `@opsorama/react` now lists `react-dom` as a peer dependency next to `react`.
