import * as THREE from 'three';
import { addObjectRelease } from '@opsorama/three';
import { validateSurfaceLabel, type AssetNode, type Vec3 } from '@opsorama/core';
import { MENU_BOARD, PICKUP_SHELF, WALK_IN_COOLER } from './restaurant';
import { DOSING_STATION, LIFE_RING_POST, STARTING_BLOCK } from './aquatics';

/** Front chalkboard face of the A-frame menu board, just in front of the chalk lines. */
const menuFace = (() => { const { length, spread, thickness } = MENU_BOARD, angle = Math.asin(spread / length), hinge = length * Math.cos(angle) + thickness / 2 * Math.sin(angle), d = .0095;
  return { position: [0, hinge - length / 2 * Math.cos(angle) + d * Math.sin(angle), length / 2 * Math.sin(angle) + d * Math.cos(angle)] as Vec3, rotation: [-angle, 0, 0] as Vec3 }; })();

export interface LabelSurface {
  description: string;
  size: readonly [number, number];
  position: Vec3;
  rotation?: Vec3;
  /** Apply the same artwork to each matching child, retaining the owning node's identity. */
  repeatOn?: string;
  replaceParts?: readonly string[];
  /** Bounded raster size; LCDs use 2048, ordinary stickers retain 1024. */
  resolution?: 1024 | 2048;
  multiline?: boolean;
}

/** Explicit, model-local placements. These are label surfaces, not the planned general anchor API. */
export const assetLabelSurfaces: Readonly<Record<string, LabelSurface>> = {
  monitor: { description: 'Full screen for up to six lines of text or SVG artwork.', size: [2.2, 1.2], position: [0, 1.1, .118], resolution: 2048, multiline: true, replaceParts: ['monitor-placeholder'] },
  'information-board': { description: 'Portrait information screen for up to six lines of text or SVG artwork.', size: [1.12, 1.32], position: [0, 1.3, .118], resolution: 2048, multiline: true, replaceParts: ['board-placeholder'] },
  'lab-tray': { description: 'Front branch/quantity plaque.', size: [.64, .1], position: [0, .15, .482] },
  parcel: { description: 'Large front sticker of the carton.', size: [.78, .42], position: [0, .52, .447], repeatOn: 'count-part-', replaceParts: ['parcel-barcode', 'parcel-sticker'] },
  'parcel-base': { description: 'Same front sticker on every parcel on the base (one owning node).', size: [.78, .42], position: [0, .52, .447], repeatOn: 'count-part-', replaceParts: ['parcel-barcode', 'parcel-sticker'] },
  pallet: { description: 'Same front sticker on every box on the pallet (one owning node).', size: [.78, .42], position: [0, .52, .447], repeatOn: 'count-part-', replaceParts: ['parcel-barcode', 'parcel-sticker'] },
  bag: { description: 'Large front sticker.', size: [.66, .42], position: [0, .57, .271], replaceParts: ['bag-sticker'] },
  tote: { description: 'Front wall of the bin.', size: [1, .38], position: [0, .3, .405] },
  storefront: { description: 'Front sign above the awning.', size: [3.4, .42], position: [0, 2.62, 1.573], replaceParts: ['shop-sign-text'] },
  sign: { description: 'Sign face inside the frame, for text or icon artwork.', size: [1.2, .6], position: [0, 1.7, .036], replaceParts: ['sign-placeholder'] },
  pavilion: { description: 'Sign strip on the back wall, facing the open front.', size: [3.6, .25], position: [0, 2.13, -1.488] },
  'parcel-locker': { description: 'Header sign above the compartments.', size: [2.2, .23], position: [0, 2.175, .301] },
  'returns-drop-box': { description: 'Front plate below the deposit slot.', size: [.72, .42], position: [0, .66, .386], replaceParts: ['dropbox-arrow'] },
  'delivery-van': { description: 'Right cargo side, above the stripe.', size: [3, 1], position: [1.006, 1.7, -1], rotation: [0, Math.PI / 2, 0] },
  'order-ticket': { description: 'Colored header strip, for an order number.', size: [.32, .07], position: [0, .52, .012] },
  'put-wall': { description: 'Header sign above the cubbies.', size: [1.7, .13], position: [0, 2.2, .217] },
  'label-printer': { description: 'Printed label on the feed tongue.', size: [.15, .11], position: [0, .1245, .21], rotation: [-Math.PI / 2, 0, 0] },
  'parcel-scale': { description: 'Display screen, for a host-supplied weight.', size: [.24, .09], position: [0, .95, -.219] },
  'poly-mailer': { description: 'Top shipping sticker on every visible mailer (same artwork, one node).', size: [.17, .11], position: [.08, .0905, 0], rotation: [-Math.PI / 2, 0, 0], repeatOn: 'count-part-', replaceParts: ['mailer-sticker'] },
  'carrier-pickup-point': { description: 'Sign panel on the post, for a carrier or route name.', size: [.6, .35], position: [-1.1, 1.9, -.768] },
  'hold-cage': { description: 'Sign on the door, for a hold reason or area name.', size: [.33, .18], position: [.5, 1.5, .859] },
  'click-collect-counter': { description: 'Front panel facing customers.', size: [1.6, .35], position: [0, .6, .322] },
  'checkout-counter': { description: 'Lane sign on the pole.', size: [.26, .16], position: [-.85, 2.02, -.274] },
  'store-shelving': { description: 'Header board above the shelves.', size: [1.9, .17], position: [0, 1.95, .117] },
  'customer-house': { description: 'House number plate beside the door.', size: [.28, .16], position: [1.25, 1.8, 1.322] },
  whiteboard: { description: 'Header strip above the three columns.', size: [1.7, .17], position: [0, 1.78, .037] },
  'ev-charger': { description: 'Charger screen, for a host-supplied status or price.', size: [.26, .18], position: [0, 1.22, .137] },
  'machine-tool': { description: 'Control pendant screen, for a job or program name.', size: [.36, .26], position: [.72, 1.42, .868] },
  'event-stage': { description: 'Rear LED screen, for a programme title or speaker.', size: [5.8, 2.8], position: [0, 3, -2.295], resolution: 2048, multiline: true },
  'exhibition-booth': { description: 'Header band above the back wall, for an exhibitor name.', size: [2.9, .36], position: [0, 2.4, -1.375] },
  'carton-flow-rack': { description: 'Header above the pick face, for a zone or SKU family.', size: [1.9, .18], position: [0, 2.1, .623] },
  'menu-board': { description: 'Front chalkboard, for a menu or daily specials (up to six lines).', size: [.48, .86], ...menuFace, resolution: 2048, multiline: true, replaceParts: ['menu-chalk'] },
  'pickup-shelf': { description: 'Header sign above the shelves, for a pickup or courier point name.', size: [1.4, .15], position: [0, 1.88, PICKUP_SHELF.depth / 2 + .012] },
  'starting-block': { description: 'Front number plate, for a lane number.', size: [.32, .22], position: [...STARTING_BLOCK.plate], replaceParts: ['block-number'] },
  'life-ring-post': { description: 'Sign plate above the ring, for a rescue point number or icon.', size: [.28, .18], position: [...LIFE_RING_POST.sign], replaceParts: ['ring-post-mark'] },
  'dosing-station': { description: 'Controller display, for host-supplied water readings.', size: [.28, .1], position: [...DOSING_STATION.display], replaceParts: ['dosing-digits'] },
  'walk-in-cooler': { description: 'Door display, for a host-supplied temperature reading.', size: [.34, .14], position: [...WALK_IN_COOLER.display], replaceParts: ['cooler-digits'] },
  truck: { description: 'Right cargo side, between the accent bands.', size: [6.4, 1.6], position: [1.292, 2.45, -1.15], rotation: [0, Math.PI / 2, 0] },
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const elements = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const attributes = new Set(['xmlns', 'version', 'id', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity', 'fx', 'fy', 'fr', 'spreadMethod', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline']);

/** Validate static, self-contained SVG before any browser image decoding; never insert it into HTML. */
export function validateLabelSvg(source: string, resolution: 1024 | 2048 = 1024): { svg: string; aspect: number } {
  if (![1024, 2048].includes(resolution)) throw new Error('Label resolution must be 1024 or 2048.');
  if (!source.trim() || source.length > 20_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Use a self-contained SVG of at most 20,000 characters, without a doctype or entities.');
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (parsed.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) throw new Error('Enter valid SVG with xmlns="http://www.w3.org/2000/svg".');
  const nodes = [root, ...root.querySelectorAll('*')];
  if (nodes.length > 512) throw new Error('SVG labels support at most 512 elements.');
  for (const node of nodes) {
    if (node.namespaceURI !== SVG_NS || !elements.has(node.localName) || (node !== root && node.localName === 'svg')) throw new Error(`Unsupported SVG element: ${node.localName}. Use static shapes or text.`);
    for (const attribute of [...node.attributes]) {
      if (!attributes.has(attribute.name) || /[\u0000-\u001f]/.test(attribute.value) || /(?:url\s*\(|:|\\)/i.test(attribute.value) && !(attribute.name === 'xmlns' && attribute.value === SVG_NS) && !/^url\(#[a-zA-Z_][\w.-]*\)$/.test(attribute.value)) throw new Error(`Unsupported SVG attribute: ${attribute.name}. Inline styles, scripts and external resources are not supported.`);
    }
  }
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || box.some(value => Math.abs(value) > 10_000) || box[2] / box[3] > 100 || box[3] / box[2] > 100) throw new Error('SVG needs a finite viewBox with positive dimensions (up to 10,000 and a 100:1 aspect ratio).');
  // Bound the decoded bitmap as well as the eventual GPU texture, regardless of SVG world coordinates.
  const longest = Math.max(box[2], box[3]);
  root.setAttribute('width', String(Math.max(1, Math.round(resolution * box[2] / longest)))); root.setAttribute('height', String(Math.max(1, Math.round(resolution * box[3] / longest))));
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return { svg: new XMLSerializer().serializeToString(root), aspect: box[2] / box[3] };
}

/** Models that already carry a surface label; a model takes one label per fresh instance. */
const labelled = new WeakSet<THREE.Object3D>();

/** The instance owns one bounded texture, shared only among its repeated stickers. */
export function applySurfaceLabel(object: THREE.Object3D, node: AssetNode, surface: LabelSurface): void {
  const label = node.surfaceLabel;
  if (!label) return;
  if (labelled.has(object)) throw new Error('Apply a surface label once per fresh model instance.');
  labelled.add(object);
  if (surface.size.length !== 2 || !surface.size.every(value => Number.isFinite(value) && value > 0) || surface.position.length !== 3 || !surface.position.every(Number.isFinite) || surface.rotation && (surface.rotation.length !== 3 || !surface.rotation.every(Number.isFinite))) throw new Error('Surface labels require positive finite dimensions and a finite local transform.');
  validateSurfaceLabel(label);
  const resolution = surface.resolution ?? 1024;
  if (![1024, 2048].includes(resolution)) throw new Error('Label resolution must be 1024 or 2048.');
  const artwork = label.kind === 'svg' ? validateLabelSvg(label.svg, resolution) : undefined;
  const canvas = document.createElement('canvas');
  const longest = Math.max(...surface.size);
  canvas.width = Math.max(1, Math.round(resolution * surface.size[0] / longest)); canvas.height = Math.max(1, Math.round(resolution * surface.size[1] / longest));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Surface labels require a 2D canvas.');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  const background = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); if (label.background) { ctx.fillStyle = label.background; ctx.fillRect(0, 0, canvas.width, canvas.height); } };
  const text = (value: string, color: string) => {
    background(); ctx.fillStyle = color; ctx.textBaseline = 'middle';
    const multiline = label.kind === 'text' && label.layout === 'multiline';
    const lines = multiline ? value.replace(/\r\n/g, '\n').split('\n') : [value];
    ctx.textAlign = multiline ? 'left' : 'center';
    let size = Math.floor(multiline ? canvas.height * .86 / (lines.length * 1.3) : canvas.height * .82);
    ctx.font = `600 ${size}px sans-serif`;
    const longestLine = Math.max(1, ...lines.map(line => ctx.measureText(line).width));
    size = Math.max(1, Math.floor(size * Math.min(1, canvas.width * (multiline ? .88 : .94) / longestLine)));
    ctx.font = `600 ${size}px sans-serif`;
    const pitch = size * 1.3, firstY = (canvas.height - (lines.length - 1) * pitch) / 2;
    lines.forEach((line, index) => ctx.fillText(line, multiline ? canvas.width * .06 : canvas.width / 2, firstY + index * pitch));
    texture.needsUpdate = true;
  };
  let image: HTMLImageElement | undefined, url: string | undefined, disposed = false;
  addObjectRelease(object, () => { if (disposed) return; disposed = true; if (image) { image.onload = null; image.onerror = null; image.src = ''; } if (url) { URL.revokeObjectURL(url); url = undefined; } texture.dispose(); });
  text(label.kind === 'text' ? label.text : label.alt, label.kind === 'text' ? label.color ?? '#243650' : '#243650');
  if (artwork) {
    image = new Image(); url = URL.createObjectURL(new Blob([artwork.svg], { type: 'image/svg+xml' }));
    const release = () => { if (url) { URL.revokeObjectURL(url); url = undefined; } };
    image.onload = () => {
      if (!disposed) {
        background(); const width = Math.min(canvas.width * .98, canvas.height * .96 * artwork.aspect), height = width / artwork.aspect;
        ctx.drawImage(image!, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); texture.needsUpdate = true;
      }
      release();
    };
    image.onerror = release; // Retain the text alternative as the static decoding fallback.
    image.src = url;
  }
  if (surface.replaceParts) object.traverse(child => { if (surface.replaceParts!.includes(child.name)) child.visible = false; });
  const targets: THREE.Object3D[] = [];
  if (surface.repeatOn) object.traverse(child => { if (child.name.startsWith(surface.repeatOn!)) targets.push(child); });
  else targets.push(object);
  for (const target of targets) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...surface.size), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.name = 'surface-label'; mesh.position.set(...surface.position); if (surface.rotation) mesh.rotation.set(...surface.rotation);
    target.add(mesh);
  }
}
