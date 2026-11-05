import type { PanelNode } from './index';
export type DOMContent = Node | string | number | null | undefined;

interface Mounted { spec: PanelNode<DOMContent>; node: Node; children: Mounted[]; listener?: EventListener; input?: EventListener; }
// Built-in icons use these tags; HTML elements cannot render SVG geometry.
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'g']);
function isDOMNode(value: DOMContent): value is Node { return typeof value === 'object' && value !== null && 'nodeType' in value; }
function create(doc: Document, spec: PanelNode<DOMContent>): Mounted {
  if (spec.kind === 'content') return { spec, node: isDOMNode(spec.value) ? spec.value : doc.createTextNode(String(spec.value ?? '')), children: [] };
  const mounted: Mounted = { spec, node: SVG_TAGS.has(spec.tag) ? doc.createElementNS('http://www.w3.org/2000/svg', spec.tag) : doc.createElement(spec.tag), children: [] };
  patch(mounted, spec, doc);
  return mounted;
}
function release(mounted: Mounted) {
  if (mounted.listener) mounted.node.removeEventListener('click', mounted.listener);
  if (mounted.input) mounted.node.removeEventListener('input', mounted.input);
  mounted.children.forEach(release);
}
function compatible(a: PanelNode<DOMContent>, b: PanelNode<DOMContent>) {
  return a.kind === b.kind && (a.kind === 'content' || (b.kind === 'element' && a.tag === b.tag && a.key === b.key));
}
function patch(mounted: Mounted, spec: PanelNode<DOMContent>, doc: Document): Mounted {
  if (!compatible(mounted.spec, spec)) {
    const next = create(doc, spec); mounted.node.parentNode?.replaceChild(next.node, mounted.node); release(mounted); return next;
  }
  if (spec.kind === 'content') {
    const node = isDOMNode(spec.value) ? spec.value : undefined;
    if (node && mounted.node !== node) { mounted.node.parentNode?.replaceChild(node, mounted.node); mounted.node = node; }
    else if (!node) {
      if (mounted.node.nodeType !== 3) { const text = doc.createTextNode(''); mounted.node.parentNode?.replaceChild(text, mounted.node); mounted.node = text; }
      const text = String(spec.value ?? ''); if (mounted.node.textContent !== text) mounted.node.textContent = text;
    }
    mounted.spec = spec; return mounted;
  }
  const element = mounted.node as HTMLElement | SVGElement, previous = mounted.spec.kind === 'element' ? mounted.spec : spec;
  for (const name of Object.keys(previous.attrs)) if (!(name in spec.attrs)) element.removeAttribute(name);
  for (const [name, value] of Object.entries(spec.attrs)) {
    if (value === undefined || (value === false && !name.startsWith('aria-') && !name.startsWith('data-'))) element.removeAttribute(name);
    else element.setAttribute(name, value === true && !name.startsWith('aria-') && !name.startsWith('data-') ? '' : String(value));
  }
  element.removeAttribute('style');
  for (const [name, value] of Object.entries(spec.style ?? {})) element.style.setProperty(name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`), value);
  if (mounted.listener) element.removeEventListener('click', mounted.listener);
  mounted.listener = spec.onClick ? () => spec.onClick?.() : undefined;
  if (mounted.listener) element.addEventListener('click', mounted.listener);
  if (mounted.input) element.removeEventListener('input', mounted.input);
  mounted.input = spec.onInput ? event => spec.onInput?.((event.target as HTMLInputElement).value) : undefined;
  if (mounted.input) element.addEventListener('input', mounted.input);
  // The value attribute is only the initial value once a user has moved a control.
  if (spec.tag === 'input' && spec.attrs.value !== undefined && (element as HTMLInputElement).value !== String(spec.attrs.value)) (element as HTMLInputElement).value = String(spec.attrs.value);
  const old = mounted.children, used = new Set<Mounted>();
  const keyed = new Map(old.flatMap(item => item.spec.kind === 'element' && item.spec.key !== undefined ? [[item.spec.key, item] as const] : []));
  mounted.children = spec.children.map((child, index) => {
    const key = child.kind === 'element' ? child.key : undefined;
    const candidate = key !== undefined ? keyed.get(key) : old[index];
    const current = candidate && !used.has(candidate) ? (used.add(candidate), patch(candidate, child, doc)) : create(doc, child);
    // Insert only when order changes; stable content keeps focus and native control state.
    const at = element.childNodes[index]; if (at !== current.node) element.insertBefore(current.node, at ?? null);
    return current;
  });
  for (const item of old) if (!used.has(item)) { release(item); if (item.node.parentNode === element) element.removeChild(item.node); }
  mounted.spec = spec; return mounted;
}

/** Owns one root only. Host-supplied Nodes are moved into their slot, never cloned. */
export function mountPanel(container: HTMLElement, initial: PanelNode<DOMContent>) {
  let disposed = false, root = create(container.ownerDocument, initial);
  container.appendChild(root.node);
  return {
    update(next: PanelNode<DOMContent>) {
      if (disposed) throw new Error('Panel has been disposed.');
      const doc = container.ownerDocument, focused = doc.activeElement;
      root = patch(root, next, doc);
      // Moving keyed ancestors may blur a retained control in native DOM reconciliation.
      if (focused && root.node.contains(focused) && doc.activeElement === doc.body && typeof (focused as HTMLElement).focus === 'function') (focused as HTMLElement).focus({ preventScroll: true });
    },
    dispose() { if (disposed) return; disposed = true; release(root); root.node.parentNode?.removeChild(root.node); },
  };
}
