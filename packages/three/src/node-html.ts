import type { Vec3 } from '@opsorama/core';

/*
 * Host HTML that follows a scene node: menus, tooltips and quick actions over a model. The renderer owns the layer the
 * elements live in and projects their points every frame; this module keeps the attachments, validates their options and
 * writes positions only when they change, without touching Three.js, so it is testable without a browser.
 */

/** How an attached element sits on its projected point. */
export const NODE_HTML_ALIGNS = ['above', 'center', 'below'] as const;
/**
 * `above`: the element's bottom centre sits on the point, so it stands over the node (menus, callouts). `center`: the
 * element is centred on the point. `below`: the element's top centre hangs from the point.
 */
export type NodeHtmlAlign = (typeof NODE_HTML_ALIGNS)[number];

export interface NodeHtmlOptions {
  /**
   * A named anchor of the node's model (as in `Attachment.anchor`) that the point starts from, for example `top`. Default:
   * the node's origin. While the anchor is missing (not declared, or the node failed to build) the element is hidden.
   */
  anchor?: string;
  /**
   * Metres added to the start point in the local space of the node, or of `anchor`, so the point turns and moves with it.
   * Default with `anchor`: `[0, 0, 0]`. Default without: `[0, h, 0]`, where `h` is the height the node's label stands at
   * (the top of a catalog model, 1.65 m for a model that declares none, 0 for a marker).
   */
  offset?: Vec3;
  /** Default `above`. See `NodeHtmlAlign`. */
  align?: NodeHtmlAlign;
}

/** Where an attached element is shown, as written in the last drawn frame. */
export interface NodeHtmlState {
  /**
   * The element is shown: the node exists, is built and not hidden, its anchor (if any) exists, and the point lies in front
   * of the camera within its depth range. False before the first drawn frame.
   */
  visible: boolean;
  /** Projected point in CSS pixels from the top left of the renderer's container; NaN while not visible. */
  x: number; y: number;
}

/** One element attached with `SceneRenderer.attachHtml`. */
export interface NodeHtmlHandle {
  readonly nodeId: string;
  readonly element: HTMLElement;
  /** Replaces the options; omitted fields return to their defaults. Throws an actionable error for invalid options. */
  update(options: NodeHtmlOptions): void;
  getState(): NodeHtmlState;
  /**
   * Stops following the node, takes the element out of the scene and restores the inline styles the renderer set. Safe to
   * call more than once and after the renderer is disposed. The element is the host's: it is not otherwise changed.
   */
  remove(): void;
}

/** Throws an actionable error for invalid `NodeHtmlOptions`. */
export function validateNodeHtmlOptions(options: unknown): asserts options is NodeHtmlOptions {
  if (options === undefined) return;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('attachHtml options must be an object: { anchor?, offset?, align? }.');
  const { anchor, offset, align } = options as Record<string, unknown>;
  if (anchor !== undefined && (typeof anchor !== 'string' || !anchor.trim())) throw new Error('attachHtml anchor must be a non-empty anchor name of the node\'s model, for example "top".');
  if (offset !== undefined && !(Array.isArray(offset) && offset.length === 3 && offset.every(Number.isFinite))) throw new Error('attachHtml offset must be three finite numbers in metres: [x, y, z] in the node\'s local space.');
  if (align !== undefined && !(NODE_HTML_ALIGNS as readonly unknown[]).includes(align)) throw new Error(`attachHtml align must be one of ${NODE_HTML_ALIGNS.join(', ')}; got ${JSON.stringify(align)}.`);
}

/** CSS translate that puts an element's reference point (per `align`) on the projected point. */
export const NODE_HTML_TRANSLATE: Readonly<Record<NodeHtmlAlign, string>> = { above: 'translate(-50%,-100%)', center: 'translate(-50%,-50%)', below: 'translate(-50%,0)' };
/** Stacking of attached elements in the label layer: above labels and markers (whose hover state uses 10). */
export const NODE_HTML_Z_INDEX = '20';
/** Data attribute that marks an attached element; the renderer keeps pointer input over it away from the scene. */
export const NODE_HTML_ATTRIBUTE = 'data-node-html';

/**
 * Projects the point of an attachment: CSS pixels from the container's top left, or null while it cannot be shown (node
 * unknown, hidden or not built, anchor missing, point behind the camera).
 */
export type NodeHtmlProjector = (nodeId: string, anchor: string | undefined, offset: Vec3 | undefined) => { x: number; y: number } | null;

export interface NodeHtmlLayer {
  attach(nodeId: string, element: HTMLElement, options?: NodeHtmlOptions): NodeHtmlHandle;
  /** Positions every attached element for this frame; writes styles only for those whose position or visibility changed. */
  layout(project: NodeHtmlProjector): void;
  /** Removes every attachment, as `remove()` on each; used when the renderer is disposed. */
  clear(): void;
  /** Attached elements. */
  readonly size: number;
}

/** Inline style properties the layer sets, restored on removal. */
const STYLED = ['position', 'top', 'left', 'transform', 'visibility', 'pointerEvents', 'zIndex'] as const;
const stopWheel = (event: Event) => event.stopPropagation();

/**
 * Attachments of one renderer: elements are appended to `layer` (the renderer's label layer, which ignores pointer input
 * itself), take pointer input, and keep the wheel from zooming the scene so a scrolling menu scrolls.
 */
export function createNodeHtmlLayer(layer: Pick<HTMLElement, 'append'>): NodeHtmlLayer {
  type Attachment = { nodeId: string; element: HTMLElement; options: NodeHtmlOptions; state: NodeHtmlState; written: { x: number; y: number; align: NodeHtmlAlign; visible: boolean } | null; saved: Record<(typeof STYLED)[number], string>; hadAttribute: string | null };
  const attachments = new Map<HTMLElement, Attachment>();
  function detach(item: Attachment) {
    if (attachments.get(item.element) !== item) return;
    attachments.delete(item.element);
    item.element.remove();
    for (const key of STYLED) item.element.style[key] = item.saved[key];
    if (item.hadAttribute === null) item.element.removeAttribute(NODE_HTML_ATTRIBUTE); else item.element.setAttribute(NODE_HTML_ATTRIBUTE, item.hadAttribute);
    item.element.removeEventListener('wheel', stopWheel);
    item.state = { visible: false, x: Number.NaN, y: Number.NaN };
  }
  return {
    attach(nodeId, element, options = {}) {
      if (typeof nodeId !== 'string' || !nodeId) throw new Error('attachHtml needs the ID of a scene node as its first argument.');
      if (!element || typeof element !== 'object' || !('style' in element) || typeof element.remove !== 'function') throw new Error('attachHtml needs an HTML element to attach, for example document.createElement("div").');
      validateNodeHtmlOptions(options);
      if (attachments.has(element)) throw new Error(`This element is already attached to node "${attachments.get(element)!.nodeId}"; call remove() on its handle first, or use update() to change its options.`);
      const saved = Object.fromEntries(STYLED.map(key => [key, element.style[key]])) as Attachment['saved'];
      const item: Attachment = { nodeId, element, options: { ...options }, state: { visible: false, x: Number.NaN, y: Number.NaN }, written: null, saved, hadAttribute: element.getAttribute(NODE_HTML_ATTRIBUTE) };
      element.setAttribute(NODE_HTML_ATTRIBUTE, nodeId);
      Object.assign(element.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'auto', zIndex: NODE_HTML_Z_INDEX, visibility: 'hidden' });
      element.addEventListener('wheel', stopWheel);
      attachments.set(element, item); layer.append(element);
      return {
        nodeId, element,
        update(next) { validateNodeHtmlOptions(next); item.options = { ...next }; },
        getState: () => ({ ...item.state }),
        remove: () => detach(item),
      };
    },
    layout(project) {
      for (const item of attachments.values()) {
        const point = project(item.nodeId, item.options.anchor, item.options.offset), align = item.options.align ?? 'above', visible = point !== null;
        item.state = point ? { visible, x: point.x, y: point.y } : { visible, x: Number.NaN, y: Number.NaN };
        const last = item.written, style = item.element.style;
        if (point && (!last || last.x !== point.x || last.y !== point.y || last.align !== align)) style.transform = `translate(${point.x}px,${point.y}px) ${NODE_HTML_TRANSLATE[align]}`;
        if (!last || last.visible !== visible) style.visibility = visible ? 'visible' : 'hidden';
        item.written = point ? { x: point.x, y: point.y, align, visible } : { ...(last ?? { x: Number.NaN, y: Number.NaN, align }), visible };
      }
    },
    clear() { for (const item of [...attachments.values()]) detach(item); },
    get size() { return attachments.size; },
  };
}
