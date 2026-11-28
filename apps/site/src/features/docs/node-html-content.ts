import { NODE_HTML_ALIGNS } from '@opsorama/three';
import type { DocArticle } from './content';

/** HTML over nodes: host elements that the renderer keeps over a node, such as context menus, in every adapter. */
export const nodeHtmlArticle: DocArticle = {
  slug: 'node-html', title: 'HTML over nodes', category: 'FOUNDATIONS',
  description: 'Show your own HTML over a scene node, such as a context menu, a tooltip or quick actions: the renderer places it over the node every frame while the node moves and the camera turns, keeps its pointer input away from the scene, and removes it cleanly, in plain JavaScript, React and Vue.',
  sections: [
    { id: 'attach', title: 'Attach an element', paragraphs: [
      'renderer.attachHtml(nodeId, element, options?) puts a host element into the renderer\'s label layer and returns a NodeHtmlHandle. Every drawn frame, after node motion and the camera move, the renderer projects the element\'s point to the screen and moves the element there, so it follows routes, controllers, carried units and the camera. Only changed positions are written.',
      'The point is the node\'s origin plus offset, metres in the node\'s local space, so it turns and moves with the node. Without anchor and offset it is the height where the node\'s label stands: the top of a catalog model, 1.65 m for a model that declares none, and 0 for a marker. With anchor, the point starts at that named anchor of the model (as in Attachment.anchor), and offset defaults to [0, 0, 0].',
      `align sets which side of the element sits on the point: ${NODE_HTML_ALIGNS.join(', ')}. above (the default) puts the element's bottom centre on the point, so a menu stands over the node; center centres it; below hangs its top centre from the point. Give a menu some distance with padding in its own CSS.`,
    ], code: `const menu = document.createElement('div');
menu.className = 'node-menu';
menu.innerHTML = '<strong>Forklift</strong><button type="button">Report a problem</button>';

const handle = renderer.attachHtml('forklift', menu, { align: 'above' });
handle.update({ anchor: 'top', offset: [0, 0.2, 0] }); // omitted fields return to their defaults
handle.getState(); // { visible: true, x: 412, y: 186 } after the next drawn frame
handle.remove();`, language: 'typescript' },
    { id: 'behavior', title: 'Visibility, input and stacking', paragraphs: [
      'The element is hidden (visibility: hidden) while its node is unknown, hidden or not built yet, while its anchor is missing, and while the point lies behind the camera or outside its depth range. It shows again when that changes, so an element may be attached before its node exists or while a container view hides it. getState() reports visible and the projected point in CSS pixels from the top left of the renderer\'s container, as written in the last drawn frame.',
      'Attached elements take pointer input even though the label layer does not. Clicks, hover and the wheel over them stay away from the scene: no selection, no onPointer event, no hover and no wheel zoom, and a pointer that moves from the scene onto the element leaves the scene, so the node under it is no longer hovered. A scrolling menu therefore scrolls. To open a menu from a click on a node, call event.preventSelection() in the onPointer click handler, so the click opens the menu instead of selecting and framing the node.',
      'Attached elements are drawn above labels and markers and take no part in their collision avoidance. The renderer sets only position, top, left, transform, visibility, pointer-events and z-index inline, and marks the element with a data-node-html attribute that names the node; remove() restores the inline styles and the attribute and takes the element out of the scene. Everything else about the element is the host\'s: its content, classes, styles and event listeners.',
    ] },
    { id: 'lifecycle', title: 'Lifecycle and errors', paragraphs: [
      'One element can be attached once at a time: attaching it again throws an error that says to call remove() or update(). remove() is safe to call more than once. dispose() of the renderer removes every attached element. After dispose(), attachHtml returns a handle that does nothing and reports the element as not visible.',
      'An empty node ID, a missing element and invalid options throw an error that names the fix: anchor must be a non-empty anchor name, offset three finite numbers and align one of the values above. validateNodeHtmlOptions(options) runs the same check.',
    ] },
    { id: 'adapters', title: 'React and Vue', paragraphs: [
      'NodeHtml renders its children over a node of the provider\'s scene: React through a portal and Vue through a teleport into an element that the SceneCanvas renderer attaches with attachHtml. It takes nodeId, anchor, offset and align; className and style (Vue: class and style) apply to the box that holds the content. anchor, offset and align update without attaching again, an inline offset array is compared by value, and a new nodeId moves the same content to the other node.',
      'NodeHtml renders nothing until a SceneCanvas under the provider has mounted, during server rendering and after the renderer unmounts; a remounted renderer gets the content again. React reports the handle through onAttach (null when detached), Vue through the attach event. The React adapter needs react-dom for the portal; it is a peer dependency next to react.',
    ], code: `// React
function Scene() {
  const [open, setOpen] = useState<string | null>(null);
  const onPointer = (event: ScenePointerEvent) => {
    if (event.type !== 'click') return;
    if (event.nodeId === 'forklift') { event.preventSelection(); setOpen('forklift'); } else setOpen(null);
  };
  return <SceneCanvas assets={catalogAssets} onPointer={onPointer}>
    {open && <NodeHtml nodeId={open} className="node-menu">
      <strong>Forklift</strong>
      <button type="button" onClick={() => setOpen(null)}>Close</button>
    </NodeHtml>}
  </SceneCanvas>;
}

// Vue
h(SceneCanvas, { assets: catalogAssets, onPointer }, {
  default: () => open.value && h(NodeHtml, { nodeId: open.value, class: 'node-menu' }, {
    default: () => [h('strong', 'Forklift'), h('button', { type: 'button', onClick: () => { open.value = null; } }, 'Close')],
  }),
});`, language: 'tsx' },
    { id: 'example', title: 'Live example', paragraphs: [
      'The live example at /examples/node-html opens a context menu over a patrolling forklift, a pallet rack or a pallet. The menu follows the forklift and the camera, reports or clears a problem through the store, and frames or follows its node through the renderer API, in React, Vue and plain JavaScript.',
    ] },
  ],
};
