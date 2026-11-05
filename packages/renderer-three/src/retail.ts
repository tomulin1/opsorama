import * as THREE from 'three';
import { projectContents } from '@opsorama/core';
import { objectPalette, resolveObjectColor } from './object-palette';
import type { MaterialContext } from './laboratory';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block, cylinder, gridWires, ITEM_TONES, part, wires } from './parts';

const MESH = { color: '#c3d0e0', opacity: .22 } as const;

/** Shopping cart pushed toward +z; `count` places 0–6 decorative items in the basket. Color changes rails and frame. */
export function createShoppingCart(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const cart = new THREE.Group(); cart.name = 'shopping-cart';
  const palette = objectPalette(node, context, 'structure'), frame = palette.structure;
  const items = node.contents ? projectContents(node.contents, 6).visible : undefined;
  const count = items?.length ?? resolveCountRepresentation(node, assetCountDefinitions['shopping-cart']).count;
  block(cart, [.6, .03, .9], [0, .55, 0], frame, 'cart-floor');
  for (const x of [-.3, .3]) block(cart, [.02, .4, .9], [x, .75, 0], palette.glass, 'cart-mesh', { opacity: MESH.opacity });
  for (const z of [-.45, .45]) block(cart, [.6, .4, .02], [0, .75, z], palette.glass, 'cart-mesh', { opacity: MESH.opacity });
  // Wire grid over faint panels reads as a woven basket while the panels still bound the contents.
  const grid: number[] = [];
  for (const x of [-.3, .3]) gridWires(grid, [x, .75, 0], [.9, .4], .075, 'x');
  for (const z of [-.45, .45]) gridWires(grid, [0, .75, z], [.6, .4], .075, 'z');
  wires(cart, grid, frame, 'cart-wire');
  for (const x of [-.3, .3]) block(cart, [.04, .04, .94], [x, .95, 0], frame, 'cart-rail');
  for (const z of [-.45, .45]) block(cart, [.64, .04, .04], [0, .95, z], frame, 'cart-rail');
  for (const x of [-.25, .25]) {
    block(cart, [.04, .04, .86], [x, .1, 0], frame, 'cart-frame');
    for (const z of [-.38, .38]) {
      block(cart, [.04, .45, .04], [x, .325, z], frame, 'cart-frame');
      const caster = part(cart, new THREE.CylinderGeometry(.05, .05, .04, 12), '#273545', 'cart-caster'); caster.rotation.z = Math.PI / 2; caster.position.set(x, .05, z);
      block(cart, [.06, .05, .05], [x, .1, z], '#56657a', 'cart-caster-fork');
    }
  }
  for (const x of [-.28, .28]) block(cart, [.03, .1, .03], [x, 1, -.5], frame, 'cart-rail');
  block(cart, [.66, .06, .06], [0, 1.06, -.52], palette.accent, 'cart-handle', { bevel: .02, roughness: .45 });
  block(cart, [.56, .05, .04], [0, .13, .45], '#56657a', 'cart-bumper', { bevel: .015 });
  for (let i = 0; i < count; i++) block(cart, [.15, .22, .2], [(i % 3 - 1) * .18, .675, (Math.floor(i / 3) - .5) * .36], items?.[i]?.color ?? ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .015 });
  anchor(cart, 'handle', [0, 1.06, -.52]);
  anchor(cart, 'contents', [0, .56, 0]);
  return cart;
}

const LOCKER = { columns: 4, rows: 4 } as const;
/** Pickup locker facing +z; `count` marks 0–16 compartments occupied, bottom row first. Color changes the housing. */
export function createParcelLocker(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const locker = new THREE.Group(); locker.name = 'parcel-locker';
  const housing = resolveObjectColor(node, context, 'accent', '#3f6fd8');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['parcel-locker']);
  block(locker, [2.5, .1, .6], [0, .05, 0], '#273545', 'locker-plinth');
  block(locker, [2.5, 2.2, .55], [0, 1.2, 0], housing, 'locker-housing');
  block(locker, [2.6, .08, .7], [0, 2.34, .03], housing, 'locker-housing', { bevel: .02 });
  block(locker, [2.3, 1.88, .01], [0, 1.1, .276], '#273545', 'locker-door-gap');
  block(locker, [1.6, .14, .02], [0, 2.2, .285], '#eaf0f8', 'locker-sign');
  for (let i = 0; i < LOCKER.columns * LOCKER.rows; i++) {
    const occupied = i < count, x = (i % LOCKER.columns - 1.5) * .58, y = .38 + Math.floor(i / LOCKER.columns) * .48;
    const door = new THREE.Group(); door.name = occupied ? `count-part-${i}` : `locker-empty-${i}`; door.position.set(x, y, .29); locker.add(door);
    block(door, [.54, .42, .03], [0, 0, 0], occupied ? '#f6e2b8' : '#e8eef6', 'locker-door', { bevel: .008, roughness: .45 });
    block(door, [.025, .1, .02], [.22, -.06, .025], '#7f8fa6', 'locker-handle', { metalness: .3, roughness: .4 });
    block(door, [.3, .045, .02], [0, .14, .02], occupied ? '#f0b43c' : '#b7c2d0', occupied ? 'locker-occupied' : 'locker-free', occupied ? { emissive: '#f0b43c', roughness: .35 } : undefined);
  }
  anchor(locker, 'front', [0, 0, .4]);
  return locker;
}

/** Returns drop box facing +z with a rounded top, deposit slot and return-arrow plate. Color changes the body. */
export function createReturnsDropBox(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const box = new THREE.Group(); box.name = 'returns-drop-box';
  const body = resolveObjectColor(node, context, 'accent', '#5a7fd6');
  block(box, [.96, .06, .76], [0, .03, 0], '#273545', 'dropbox-plinth');
  block(box, [.9, .95, .7], [0, .535, 0], body, 'dropbox-body', { bevel: .02, roughness: .5 });
  // Lower collection door with an outline and a cylinder lock.
  for (const x of [-.36, .36]) block(box, [.012, .42, .006], [x, .34, .352], '#273545', 'dropbox-door-seam');
  for (const y of [.13, .55]) block(box, [.72, .012, .006], [0, y, .352], '#273545', 'dropbox-door-seam');
  const lock = cylinder(box, .025, .02, .45, '#c3cedc', 'dropbox-lock', { segments: 12, metalness: .3, roughness: .35 }); lock.rotation.x = Math.PI / 2; lock.position.set(.28, .45, .36);
  const top = part(box, new THREE.CylinderGeometry(.45, .45, .7, 32, 1, false, Math.PI / 2, Math.PI), body, 'dropbox-body', { roughness: .5 });
  top.rotation.x = Math.PI / 2; top.position.y = 1.01;
  block(box, [.5, .1, .02], [0, 1.18, .355], '#eaf0f8', 'dropbox-slot-frame', { bevel: .008 });
  block(box, [.54, .03, .05], [0, 1.25, .36], '#d6dee9', 'dropbox-slot-hood');
  block(box, [.42, .045, .02], [0, 1.18, .365], '#273545', 'dropbox-slot');
  block(box, [.5, .32, .02], [0, .66, .36], '#f6f8fb', 'dropbox-plate');
  block(box, [.24, .045, .015], [.03, .62, .375], body, 'dropbox-arrow');
  block(box, [.045, .12, .015], [.15, .67, .375], body, 'dropbox-arrow');
  for (const side of [-1, 1]) block(box, [.1, .04, .015], [-.06, .62 + side * .03, .375], body, 'dropbox-arrow').rotation.z = side * Math.PI / 4;
  anchor(box, 'slot', [0, 1.18, .37]);
  return box;
}

/** Small shop facing +z with display window, door and striped awning. Color changes the awning and sign band. */
export function createStorefront(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const shop = new THREE.Group(); shop.name = 'storefront';
  const accent = resolveObjectColor(node, context, 'accent', '#e26d5a'), trim = '#b9c6d6', glass = { opacity: .55, roughness: .1 };
  block(shop, [4, 3, 3], [0, 1.5, 0], '#eef2f7', 'shop-wall');
  block(shop, [4.1, .15, 3.1], [0, 3.075, 0], trim, 'shop-roof', { bevel: .02 });
  block(shop, [4.04, .25, 3.04], [0, .125, 0], '#c9d4e2', 'shop-plinth');
  block(shop, [4.06, .08, 3.06], [0, 2.92, 0], '#d6dee9', 'shop-cornice');
  block(shop, [3.6, .45, .05], [0, 2.62, 1.525], accent, 'shop-sign');
  block(shop, [2.4, .16, .02], [0, 2.62, 1.56], '#ffffff', 'shop-sign-text');
  for (let i = 0; i < 6; i++) {
    block(shop, [.6, .04, .9], [-1.5 + i * .6, 2.2, 1.88], i % 2 ? '#ffffff' : accent, i % 2 ? 'shop-awning-light' : 'shop-awning').rotation.x = .35;
    // Scalloped valance hanging from the awning edge.
    block(shop, [.58, .08, .02], [-1.5 + i * .6, 2.045, 2.3], i % 2 ? '#ffffff' : accent, i % 2 ? 'shop-awning-light' : 'shop-awning');
  }
  for (const x of [-1.8, 1.8]) block(shop, [.04, .04, .95], [x, 2.25, 1.9], '#7f8fa6', 'shop-awning-arm').rotation.x = .35;
  block(shop, [2.3, 1.6, .06], [-.75, 1.15, 1.51], trim, 'shop-trim');
  block(shop, [2.18, 1.48, .04], [-.75, 1.15, 1.54], '#a9cbe8', 'shop-glass', glass);
  for (const x of [-1.12, -.38]) block(shop, [.05, 1.48, .05], [x, 1.15, 1.56], trim, 'shop-mullion');
  block(shop, [2.18, .05, .05], [-.75, 1.55, 1.56], trim, 'shop-mullion');
  block(shop, [2.36, .06, .18], [-.75, .33, 1.6], '#d6dee9', 'shop-sill');
  block(shop, [1, 2.08, .06], [1.35, 1.04, 1.51], trim, 'shop-trim');
  block(shop, [.88, 2, .05], [1.35, 1, 1.53], '#3a4656', 'shop-door');
  block(shop, [.6, 1.2, .02], [1.35, 1.25, 1.565], '#a9cbe8', 'shop-glass', glass);
  block(shop, [.04, .4, .05], [1.06, 1.05, 1.59], '#c3cedc', 'shop-door-handle', { metalness: .4, roughness: .3 });
  block(shop, [1.1, .08, .4], [1.35, .04, 1.7], trim, 'shop-step');
  anchor(shop, 'entrance', [1.35, 0, 1.9]);
  return shop;
}

const COUNTER = '#eef2f7', TOP = '#f2f6fb', DARK = '#273545', SCREEN = '#182f46', PAPER = '#fbfcfe';

/** Hand basket with two handles; `count` places 0–4 decorative items in a fixed 2 × 2 layout. Color changes the basket. */
export function createHandBasket(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const basket = new THREE.Group(); basket.name = 'hand-basket';
  const color = resolveObjectColor(node, context, 'accent', '#d65b5b');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['hand-basket']);
  block(basket, [.45, .02, .3], [0, .01, 0], color, 'basket-body');
  for (const z of [-.15, .15]) block(basket, [.45, .22, .015], [0, .11, z], color, 'basket-body');
  for (const x of [-.225, .225]) block(basket, [.015, .22, .3], [x, .11, 0], color, 'basket-body');
  for (const z of [-.152, .152]) block(basket, [.46, .025, .025], [0, .215, z], color, 'basket-body', { bevel: .008 });
  // Ventilation slots: a row of darker recesses on the long sides.
  for (const z of [-.158, .158]) for (let i = 0; i < 6; i++) block(basket, [.045, .1, .004], [-.17 + i * .068, .12, z], '#000000', 'basket-slot', { opacity: .18 });
  for (const z of [-.07, .07]) { const handle = part(basket, new THREE.TorusGeometry(.16, .014, 8, 20, Math.PI), DARK, 'basket-handle', { roughness: .45 }); handle.position.set(0, .22, z); }
  for (let i = 0; i < count; i++) block(basket, [.16, .12, .11], [(i % 2 - .5) * .2, .08, (Math.floor(i / 2) - .5) * .13], ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .01 });
  return basket;
}

/** In-store pickup counter facing customers at +z, with a back shelf of 0–8 waiting orders. Color changes the front panel. */
export function createClickCollectCounter(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const desk = new THREE.Group(); desk.name = 'click-collect-counter';
  const accent = resolveObjectColor(node, context, 'accent', '#3fa37f');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['click-collect-counter']);
  block(desk, [2, 1, .6], [0, .5, 0], COUNTER, 'counter-body');
  block(desk, [2.1, .05, .7], [0, 1.025, 0], TOP, 'counter-top', { bevel: .015, roughness: .4 });
  block(desk, [1.96, .1, .02], [0, .05, .3], DARK, 'counter-kick');
  block(desk, [1.9, .6, .02], [0, .55, .31], accent, 'counter-panel');
  block(desk, [.06, .25, .06], [.6, 1.17, 0], DARK, 'counter-screen');
  block(desk, [.5, .32, .03], [.6, 1.42, 0], DARK, 'counter-screen');
  block(desk, [.44, .26, .01], [.6, 1.42, .02], SCREEN, 'counter-display');
  for (const x of [-1, 1]) for (const z of [-.83, -1.27]) block(desk, [.04, 1.5, .04], [x, .75, z], '#7f8fa6', 'counter-shelf');
  for (const y of [.4, 1.1]) block(desk, [2.04, .03, .45], [0, y, -1.05], '#e4eaf2', 'counter-shelf');
  for (let i = 0; i < count; i++) {
    const order = block(desk, [.4, .3, .35], [(i % 4 - 1.5) * .48, [.4, 1.1][Math.floor(i / 4)] + .165, -1.05], ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .015 });
    block(order, [.16, .1, .005], [.08, 0, .178], PAPER, 'counter-order-label');
  }
  anchor(desk, 'customer', [0, 0, .85]); anchor(desk, 'staff', [0, 0, -.55]);
  return desk;
}

/** Checkout lane: belt toward the cashier, payment terminal and lane sign. Customers stand at +z, the cashier at −z. Color changes the side panel and sign. */
export function createCheckoutCounter(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const till = new THREE.Group(); till.name = 'checkout-counter';
  const accent = resolveObjectColor(node, context, 'accent', '#5a7fd6');
  block(till, [1.8, .9, .7], [0, .45, 0], COUNTER, 'checkout-body');
  block(till, [1.8, .5, .02], [0, .5, .36], accent, 'checkout-panel');
  block(till, [1.85, .04, .75], [0, .92, 0], TOP, 'checkout-top', { bevel: .012, roughness: .4 });
  block(till, [1.76, .1, .02], [0, .05, .35], DARK, 'checkout-kick');
  block(till, [1, .02, .45], [-.35, .95, .05], DARK, 'checkout-belt', { roughness: .9 });
  for (const x of [-.85, .15]) { const roller = part(till, new THREE.CylinderGeometry(.018, .018, .46, 10), '#7f8fa6', 'checkout-roller', { metalness: .3, roughness: .4 }); roller.rotation.x = Math.PI / 2; roller.position.set(x, .95, .05); }
  for (const z of [-.18, .28]) block(till, [1, .03, .02], [-.35, .96, z], '#7f8fa6', 'checkout-belt-guide');
  block(till, [.26, .006, .2], [.36, .943, .08], '#182f46', 'checkout-scanner', { roughness: .15 });
  block(till, [.03, .04, .45], [.18, .97, .05], '#7f8fa6', 'checkout-divider');
  block(till, [.12, .05, .16], [.55, .965, .22], DARK, 'checkout-terminal').rotation.x = -.35;
  block(till, [.05, .3, .05], [.55, 1.09, -.15], DARK, 'checkout-screen');
  block(till, [.34, .24, .03], [.55, 1.3, -.15], DARK, 'checkout-screen');
  block(till, [.3, .2, .01], [.55, 1.3, -.17], SCREEN, 'checkout-display');
  const pole = part(till, new THREE.CylinderGeometry(.025, .025, 1, 8), '#7f8fa6', 'checkout-pole'); pole.position.set(-.85, 1.44, -.3);
  block(till, [.32, .22, .03], [-.85, 2.02, -.3], accent, 'checkout-sign');
  block(till, [.27, .17, .01], [-.85, 2.02, -.28], '#fbfcfe', 'checkout-sign-panel');
  anchor(till, 'customer', [0, 0, .8]); anchor(till, 'cashier', [.55, 0, -.7]);
  return till;
}

const SHELF_LEVELS = [.15, .55, .95, 1.35] as const;
/** Single-sided store shelf facing +z; `count` fills 0–24 product facings, six per shelf from the bottom-left. Color changes the back panel and header. */
export function createStoreShelving(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const shelf = new THREE.Group(); shelf.name = 'store-shelving';
  const accent = resolveObjectColor(node, context, 'accent', '#5a7fd6');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['store-shelving']);
  block(shelf, [2, .1, .45], [0, .05, 0], DARK, 'shelving-plinth', { bevel: .01 });
  block(shelf, [2, 1.8, .03], [0, 1, -.21], accent, 'shelving-back');
  for (const x of [-1, 1]) block(shelf, [.03, 1.8, .45], [x, 1, 0], '#d6dee9', 'shelving-side');
  for (const y of SHELF_LEVELS) { block(shelf, [1.97, .025, .42], [0, y, 0], '#e4eaf2', 'shelving-shelf'); block(shelf, [1.97, .04, .01], [0, y - .01, .215], '#fbfcfe', 'shelving-price-strip'); }
  block(shelf, [2, .2, .03], [0, 1.95, .1], accent, 'shelving-header');
  for (let i = 0; i < count; i++) {
    const facing = new THREE.Group(); facing.name = `count-part-${i}`; facing.position.set(-.8 + (i % 6) * .32, SHELF_LEVELS[Math.floor(i / 6)] + .0125, 0); shelf.add(facing);
    const tone = ITEM_TONES[(i + Math.floor(i / 6)) % 3];
    // Alternate boxed goods with pairs of bottles so facings do not read as identical crates.
    if (i % 3 === 1) for (const z of [-.1, .1]) for (const x of [-.065, .065]) { const bottle = cylinder(facing, .055, .24, .12, tone, 'shelving-product', { segments: 12, roughness: .35 }); bottle.position.set(x, .12, z); cylinder(facing, .025, .05, .265, '#56657a', 'shelving-cap', { segments: 8 }).position.set(x, .265, z); }
    else for (const z of [-.1, .1]) block(facing, [.26, i % 3 ? .2 : .28, .18], [0, i % 3 ? .1 : .14, z], tone, 'shelving-product', { bevel: .01 });
  }
  return shelf;
}

/** Small house as a last-mile delivery destination; the door faces +z with a doorstep delivery anchor. Color changes the roof. */
export function createCustomerHouse(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const house = new THREE.Group(); house.name = 'customer-house';
  const roof = resolveObjectColor(node, context, 'structure', '#c8665a'), glass = { opacity: .55, roughness: .1 };
  block(house, [3, 2.4, 2.6], [0, 1.2, 0], COUNTER, 'house-wall');
  block(house, [3.06, .28, 2.66], [0, .14, 0], '#c9d4e2', 'house-plinth');
  for (const z of [-1.43, 1.43]) block(house, [3.3, .06, .08], [0, 2.38, z], '#9aa8ba', 'house-gutter');
  const shape = new THREE.Shape([new THREE.Vector2(-1.7, 2.4), new THREE.Vector2(1.7, 2.4), new THREE.Vector2(0, 3.5)]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false }); geometry.translate(0, 0, -1.45);
  part(house, geometry, roof, 'house-roof');
  block(house, [.3, .7, .3], [-.9, 3, -.5], '#b9c6d6', 'house-chimney');
  block(house, [1.02, 2.08, .04], [.6, 1.04, 1.305], '#fbfcfe', 'house-door-frame');
  block(house, [.9, 2, .05], [.6, 1, 1.31], '#3a4656', 'house-door', { bevel: .01 });
  for (const y of [.55, 1.45]) block(house, [.6, .5, .01], [.6, y, 1.338], '#46566b', 'house-door-panel');
  cylinder(house, .035, .05, 1, '#e3c27a', 'house-door-knob', { segments: 10, metalness: .4, roughness: .3 }).position.set(.95, 1, 1.35);
  for (const x of [-.95, -.15]) {
    block(house, [.7, .7, .03], [x, 1.5, 1.305], '#fbfcfe', 'house-window-frame');
    block(house, [.6, .6, .04], [x, 1.5, 1.31], '#a9cbe8', 'house-window', glass);
    block(house, [.03, .6, .045], [x, 1.5, 1.315], '#fbfcfe', 'house-window-frame'); block(house, [.6, .03, .045], [x, 1.5, 1.315], '#fbfcfe', 'house-window-frame');
    block(house, [.78, .05, .12], [x, 1.12, 1.35], '#d6dee9', 'house-sill');
  }
  block(house, [1.1, .1, .5], [.6, .05, 1.55], '#b9c6d6', 'house-step');
  block(house, [.3, .18, .02], [1.25, 1.8, 1.31], '#fbfcfe', 'house-plate');
  anchor(house, 'delivery', [.6, 0, 1.95]);
  return house;
}
