import { createLabFlask, createLabTray, createLabWorkstation, type MaterialContext } from './laboratory';
import { validateOperatingProperties } from '@opsorama/core';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AssetNode } from '@opsorama/core';
import { assetDisplayDefinitions, createReadout, createMonitor, createInformationBoard } from './displays';
import { createPerson } from './worker';
import { PERSON_ASSETS } from '@opsorama/core';
import { createBuilding } from './building';
import { clearAssetAnimator } from './animation';
import { createPineTree, createPalmTree } from './trees';
import { createCapacityGauge, createMapPin, createSign, createStatusBeacon } from './signals';
import { createConveyor, createGate, createTote } from './handling';
import { createEquipmentCabinet, createWallSegment } from './structures';
import { anchor } from './parts';
import { objectPalette } from './object-palette';
import { addInspectionKit, addPackingKit, createCarrierPickupPoint, createHoldCage, createLabelPrinter, createMailSack, createOrderTicket, createPackagingSupply, createParcelScale, createPickingCart, createPolyMailer, createPutWall, createRollCage } from './fulfillment';
import { createCargoBike, createDeliveryVan, createPalletJack, createTruck } from './vehicles';
import { createBench, createLampPost, createPottedPlant } from './decor';
import { createCoolingUnit, createNetworkSwitch, createRackServer, createUpsUnit } from './datacenter';
import { createAirCooledChiller, createAisleContainment, createBatteryBank, createElectricalSwitchgear, createGeneratorSet } from './facility';
import { assetMeasurementDefinitions, createBatteryIndicator, createDialGauge, createRingGauge } from './gauges';
import { createOfficeChair, createDeskPod, createFocusPod, createMeetingTable, createWhiteboard } from './office';
import { createCheckoutCounter, createClickCollectCounter, createCustomerHouse, createHandBasket, createParcelLocker, createReturnsDropBox, createShoppingCart, createStoreShelving, createStorefront } from './retail';
import { resolveCountRepresentation } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { assetCountLayoutDefaults } from './count-layout';
import { createPallet, createParcel, createParcelBase } from './parcels';
import { createForklift, createLoadingDock, createShippingContainer } from './logistics';
import { createMachineTool, createMobileRobot, createRobotArm, createSecurityCamera } from './automation';
import { createEvCharger, createPumpUnit, createSolarArray, createStorageTank, createWindTurbine } from './energy';
import { createFenceSegment, createTrafficCone, createWasteBin } from './site';
import { createGantryCrane, createTowerCrane, createValve } from './industry';
import { createAircraft, createBaggageCart } from './airport';
import { createHospitalBed, createKitchenStation, createServiceCart } from './care';
import { createGrainSilo, createTractor } from './agriculture';
import { createEventStage, createExhibitionBooth } from './events';
import { createBulkBag, createCartonFlowRack, createDrumPallet, createIbcTank, createPalletRack, createPalletStack, createReachTruck, createSafetyBarrier, createStretchWrapper } from './warehouse';
import { createBarCounter, createBarStool, createBoothSeating, createDiningTable, createDishMachine, createEspressoMachine, createHeatedPass, createHostStand, createMenuBoard, createPatioUmbrella, createPickupShelf, createPizzaOven, createWalkInCooler } from './restaurant';
import { createDeckShower, createDosingStation, createLapPool, createLifeRingPost, createLifeguardChair, createPoolLadder, createSandFilter, createStartingBlock, createSunLounger, createSwimmer, createWadingPool } from './aquatics';
import { createBarn, createChickenCoop, createCropField, createHayBale, createPaddockFence, createTrough } from './farm';
import { createBird, createCat, createChicken, createCow, createDog, createHorse, createPig, createSheep } from './animals';
import { assetFootprintDefinitions, createFloor, createRoad, createSidewalk, createTerrain } from './surfaces';
import { applySurfaceLabel, assetLabelSurfaces, disposeSurfaceLabels } from './surface-labels';
export type AssetFactory = (node: AssetNode, context?: MaterialContext) => THREE.Object3D;
export type AssetRegistry = Readonly<Record<string, AssetFactory>>;
function box(group: THREE.Group, size: readonly number[], position: readonly number[], color: string, bevel = 0) {
  const mesh = new THREE.Mesh(bevel ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, bevel) : new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ color, roughness: .72 }));
  mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
/** Bag defaults that keep its sage body, dark rope handles and paper sticker in the default scene. */
const BAG_TONES = { surface: '#81b5a3', structure: '#385e54', text: '#f5f4ea' } as const;
/** Pavilion defaults that keep its blue walls, grey floor and pale sign strip in the default scene. */
const PAVILION_TONES = { structure: '#5481dc', surface: '#cfd8e3', text: '#e3efff' } as const;
/** Floor x positions of the three staging spots, 0.5 m in front of the back wall line. */
const PAVILION_STOCK = [-1.1, 0, 1.1] as const;
/** Workstation defaults that keep its blue frame, white top and dark terminal in the default scene. */
const STATION_TONES = { structure: '#6489d6', surface: '#f6f7fb', screen: '#2e465f', glass: '#bddfdf', trim: '#a9baca' } as const;
/** Shelf defaults that keep its blue frame, tan cartons and pale blue totes in the default scene. */
const SHELF_TONES = { structure: '#356dd8', surface: '#d8b487', accent: '#95b7df', trim: '#eee2c8' } as const;
/** Step-beam heights; deck tops are 0.04 m above. */
const SHELF_LEVELS = [.18, 1.05, 1.92] as const;
/** Storage slot floor points, four per level from left to right, bottom level first. */
export const SHELF_SLOTS: readonly (readonly [number, number])[] = SHELF_LEVELS.flatMap(y => [0, 1, 2, 3].map(i => [-1.06 + i * .7, y + .04] as const));
const models: AssetRegistry = {
  forklift: createForklift,
  'loading-dock': createLoadingDock,
  'shipping-container': createShippingContainer,
  monitor: createMonitor,
  'information-board': createInformationBoard,
  'led-display': createReadout,
  'analog-clock': createReadout,
  'digital-clock': createReadout,
  stopwatch: createReadout,
  'countdown-timer': createReadout,
  'lab-flask': createLabFlask,
  'lab-tray': createLabTray,
  'lab-workstation': createLabWorkstation,
  building: createBuilding,
  pallet: createPallet,
  'ring-gauge': createRingGauge,
  'dial-gauge': createDialGauge,
  'battery-indicator': createBatteryIndicator,
  'rack-server': createRackServer,
  'network-switch': createNetworkSwitch,
  'cooling-unit': createCoolingUnit,
  'ups-unit': createUpsUnit,
  'generator-set': createGeneratorSet,
  'air-cooled-chiller': createAirCooledChiller,
  'electrical-switchgear': createElectricalSwitchgear,
  'battery-bank': createBatteryBank,
  'aisle-containment': createAisleContainment,
  'tree-pine': createPineTree,
  'tree-palm': createPalmTree,
  'status-beacon': createStatusBeacon,
  'capacity-gauge': createCapacityGauge,
  'map-pin': createMapPin,
  sign: createSign,
  'delivery-van': createDeliveryVan,
  'cargo-bike': createCargoBike,
  'pallet-jack': createPalletJack,
  'shopping-cart': createShoppingCart,
  'parcel-locker': createParcelLocker,
  'returns-drop-box': createReturnsDropBox,
  storefront: createStorefront,
  'desk-pod': createDeskPod,
  'office-chair': createOfficeChair,
  'meeting-table': createMeetingTable,
  whiteboard: createWhiteboard,
  'focus-pod': createFocusPod,
  'potted-plant': createPottedPlant,
  bench: createBench,
  'lamp-post': createLampPost,
  tote: createTote,
  conveyor: createConveyor,
  gate: createGate,
  'wall-segment': createWallSegment,
  'equipment-cabinet': createEquipmentCabinet,
  'order-ticket': createOrderTicket,
  'picking-cart': createPickingCart,
  'put-wall': createPutWall,
  'roll-cage': createRollCage,
  'packaging-supply': createPackagingSupply,
  'label-printer': createLabelPrinter,
  'parcel-scale': createParcelScale,
  'poly-mailer': createPolyMailer,
  'mail-sack': createMailSack,
  'carrier-pickup-point': createCarrierPickupPoint,
  'hold-cage': createHoldCage,
  'hand-basket': createHandBasket,
  'click-collect-counter': createClickCollectCounter,
  'checkout-counter': createCheckoutCounter,
  'store-shelving': createStoreShelving,
  'customer-house': createCustomerHouse,
  'mobile-robot': createMobileRobot,
  'robot-arm': createRobotArm,
  'machine-tool': createMachineTool,
  'security-camera': createSecurityCamera,
  'ev-charger': createEvCharger,
  'solar-array': createSolarArray,
  'wind-turbine': createWindTurbine,
  'storage-tank': createStorageTank,
  'pump-unit': createPumpUnit,
  'fence-segment': createFenceSegment,
  'waste-bin': createWasteBin,
  'traffic-cone': createTrafficCone,
  valve: createValve,
  'tower-crane': createTowerCrane,
  'gantry-crane': createGantryCrane,
  aircraft: createAircraft,
  'baggage-cart': createBaggageCart,
  'hospital-bed': createHospitalBed,
  'service-cart': createServiceCart,
  'kitchen-station': createKitchenStation,
  tractor: createTractor,
  'grain-silo': createGrainSilo,
  'event-stage': createEventStage,
  'exhibition-booth': createExhibitionBooth,
  'pallet-rack': createPalletRack,
  'reach-truck': createReachTruck,
  'stretch-wrapper': createStretchWrapper,
  'carton-flow-rack': createCartonFlowRack,
  'safety-barrier': createSafetyBarrier,
  'pallet-stack': createPalletStack,
  'ibc-tank': createIbcTank,
  'drum-pallet': createDrumPallet,
  'bulk-bag': createBulkBag,
  'dining-table': createDiningTable,
  'booth-seating': createBoothSeating,
  'bar-counter': createBarCounter,
  'bar-stool': createBarStool,
  'espresso-machine': createEspressoMachine,
  'pizza-oven': createPizzaOven,
  'walk-in-cooler': createWalkInCooler,
  'heated-pass': createHeatedPass,
  'pickup-shelf': createPickupShelf,
  'host-stand': createHostStand,
  'menu-board': createMenuBoard,
  'dish-machine': createDishMachine,
  'patio-umbrella': createPatioUmbrella,
  'lap-pool': createLapPool,
  'wading-pool': createWadingPool,
  swimmer: createSwimmer,
  'starting-block': createStartingBlock,
  'lifeguard-chair': createLifeguardChair,
  'pool-ladder': createPoolLadder,
  'sun-lounger': createSunLounger,
  'deck-shower': createDeckShower,
  'life-ring-post': createLifeRingPost,
  'dosing-station': createDosingStation,
  'sand-filter': createSandFilter,
  barn: createBarn,
  'paddock-fence': createPaddockFence,
  'hay-bale': createHayBale,
  trough: createTrough,
  'chicken-coop': createChickenCoop,
  'crop-field': createCropField,
  cow: createCow,
  horse: createHorse,
  sheep: createSheep,
  pig: createPig,
  chicken: createChicken,
  dog: createDog,
  cat: createCat,
  bird: createBird,
  road: createRoad,
  sidewalk: createSidewalk,
  floor: createFloor,
  terrain: createTerrain,
  ...Object.fromEntries(PERSON_ASSETS.map(asset => [asset, createPerson])),
  parcel: createParcel,
  'parcel-base': createParcelBase,
  bag: (node, context) => {
    // Body, handles and sticker use palette roles; status tints the body like the parcel, and the rim fold and creases are shades.
    const p = objectPalette(node, context, 'surface', BAG_TONES), group = new THREE.Group();
    const body = p.surface;
    const fold = `#${new THREE.Color(body).lerp(new THREE.Color('#ffffff'), .22).getHexString()}`, crease = `#${new THREE.Color(p.structure).offsetHSL(-.0047, -.0645, -.0273).getHexString()}`;
    // The body rests on the pivot (it used to float 3 cm above it).
    box(group, [.82, 1.04, .5], [0, .52, 0], body, .02);
    // Folded paper rim, side gusset creases and two rope handles instead of one solid loop.
    box(group, [.83, .09, .51], [0, 1, 0], fold);
    for (const x of [-.412, .412]) box(group, [.003, .88, .006], [x, .52, 0], crease).castShadow = false;
    for (const z of [-.17, .17]) { const handle = new THREE.Mesh(new THREE.TorusGeometry(.17, .014, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: p.structure, roughness: .9 })); handle.position.set(0, 1.045, z); handle.castShadow = true; group.add(handle); }
    box(group, [.28, .19, .015], [0, .57, .26], p.text).name = 'bag-sticker';
    anchor(group, 'contents', [0, 0, 0]); anchor(group, 'top', [0, 1.045, 0]); anchor(group, 'handle', [0, 1.215, 0]); anchor(group, 'front', [0, .57, .268]);
    return group;
  },
  shelf: (node, context) => {
    // Frame, stored cartons, totes and label strips use palette roles; decks and step beams are lighter shades of the frame.
    const p = objectPalette(node, context, 'structure', SHELF_TONES), frame = new THREE.Color(p.structure);
    const beam = `#${frame.clone().lerp(new THREE.Color('#ffffff'), .22).getHexString()}`, deck = `#${frame.clone().lerp(new THREE.Color('#dfe5ec'), .85).getHexString()}`;
    const group = new THREE.Group();
    const { count } = resolveCountRepresentation(node, assetCountDefinitions.shelf);
    for (const x of [-1.45, 1.45]) {
      for (const z of [-.48, .48]) { box(group, [.075, 2.8, .075], [x, 1.4, z], p.structure); box(group, [.15, .02, .15], [x, .01, z], '#273545'); }
      // Zig-zag end-frame bracing between the uprights.
      for (const [i, [y0, y1]] of [[.1, 1.05], [1.05, 1.92], [1.92, 2.7]].entries()) {
        const brace = box(group, [.035, Math.hypot(.96, y1 - y0), .035], [x, (y0 + y1) / 2, 0], p.structure); brace.rotation.x = (i % 2 ? 1 : -1) * Math.atan2(.96, y1 - y0);
      }
    }
    // Front and back step beams carry a lighter deck at each level.
    for (const y of SHELF_LEVELS) { for (const z of [-.5, .5]) box(group, [3.05, .1, .05], [0, y, z], beam); box(group, [2.9, .03, 1], [0, y + .025, 0], deck); }
    // Twelve named storage slots, four per level. Count boxes are decorative and fill the slots in order; real inventory attaches to the slot anchors.
    SHELF_SLOTS.forEach(([x, y], i) => anchor(group, `slot-${i}`, [x, y, 0]));
    for (let i = 0; i < count; i++) {
      const [x, y] = SHELF_SLOTS[i], carton = i % 2 === 1;
      const part = new THREE.Group(); part.name = `count-part-${i}`; part.userData.decorative = true; part.position.set(x, y, 0); group.add(part);
      box(part, [.57, .57, .75], [0, .285, 0], carton ? p.surface : p.accent, .02); box(part, [.075, .58, .76], [0, .29, 0], p.trim);
    }
    anchor(group, 'top', [0, 2.8, 0]); anchor(group, 'front', [0, SHELF_SLOTS[0][1], .53]);
    return group;
  },
  station: (node, context) => {
    const variant = node.variant ?? 'standard';
    if (variant !== 'standard' && variant !== 'packing' && variant !== 'inspection') throw new Error(`Unknown station variant: ${variant}.`);
    // Frame, bench top, terminal and keyboard use palette roles; accessories keep their natural tones.
    const p = objectPalette(node, context, 'structure', STATION_TONES), group = new THREE.Group();
    for (const x of [-1.4, 1.4]) for (const z of [-.5, .5]) { box(group, [.12, 1.1, .12], [x, .55, z], p.structure); box(group, [.16, .03, .16], [x, .015, z], '#273545'); }
    // Lower stretchers make the bench read as a welded frame rather than four loose posts.
    for (const z of [-.5, .5]) box(group, [2.68, .07, .06], [0, .22, z], p.structure);
    for (const x of [-1.4, 1.4]) box(group, [.06, .07, .88], [x, .22, 0], p.structure);
    // The back panel sits on the rear edge of the top, so the bench is centred on its pivot.
    box(group, [3.3, .16, 1.4], [0, 1.15, 0], p.surface, .025); box(group, [3.1, .6, .1], [0, 1.58, -.65], p.structure, .02);
    if (variant === 'packing') addPackingKit(group);
    else if (variant === 'inspection') addInspectionKit(group);
    else { box(group, [.72, .54, .62], [-.6, 1.5, 0], '#e0bc8d', .02); box(group, [.075, .55, .63], [-.6, 1.5, 0], '#f8eaca'); }
    box(group, [.63, .45, .07], [.73, 1.65, -.3], p.screen, .015); box(group, [.53, .33, .08], [.73, 1.65, -.24], p.glass);
    // Monitor neck and foot so the screen stands on the bench.
    box(group, [.06, .2, .05], [.73, 1.33, -.36], p.screen); box(group, [.26, .02, .16], [.73, 1.24, -.36], p.screen);
    box(group, [.62, .06, .27], [.73, 1.27, .12], p.trim, .01);
    anchor(group, 'input', [-1.65, 1.23, 0]); anchor(group, 'output', [1.65, 1.23, 0]);
    anchor(group, 'surface', [0, 1.23, .3]); anchor(group, 'top', [0, 1.88, -.65]); anchor(group, 'front', [0, 1.23, .7]);
    return group;
  },
  pavilion: (node, context) => {
    // Walls and roof use the structure role; the right wall, kick plates, gutter and roof ribs are shades of it.
    const p = objectPalette(node, context, 'structure', PAVILION_TONES), wall = new THREE.Color(p.structure);
    // HSL offsets reproduce the original #729be4 / #3463be shades for the default walls and keep that relation for any color.
    const light = `#${wall.clone().offsetHSL(-.009, -.136, .0699).getHexString()}`, dark = `#${wall.clone().offsetHSL(.0034, .0954, -.1275).getHexString()}`;
    const group = new THREE.Group(), { count } = resolveCountRepresentation(node, assetCountDefinitions.pavilion);
    box(group, [4.3, .04, 3.25], [0, .02, 0], p.surface);
    box(group, [4.4, 2.3, .15], [0, 1.15, -1.6], p.structure); box(group, [.16, 2.3, 3.25], [-2.15, 1.15, 0], p.structure);
    box(group, [.16, 2.3, 3.25], [2.15, 1.15, 0], light); box(group, [4.8, .18, 3.8], [0, 2.42, 0], p.structure);
    // Kick plates at the wall feet and a front gutter under the corrugated roof; the roof is centred on the floor.
    box(group, [4.42, .2, .17], [0, .1, -1.6], dark); for (const x of [-2.15, 2.15]) box(group, [.18, .2, 3.27], [x, .1, 0], dark);
    box(group, [4.82, .1, .1], [0, 2.3, 1.85], dark);
    for (let i = 0; i < 22; i++) box(group, [.035, .035, 3.75], [-2.3 + i * .215, 2.53, 0], dark);
    // Sign strip on the back wall; host text or SVG artwork goes on it through surfaceLabel.
    box(group, [3.6, .25, .02], [0, 2.13, -1.5], p.text).name = 'pavilion-sign';
    // Three staging spots on the floor. Count parcels are decorative; real staged stock attaches to the stock anchors.
    PAVILION_STOCK.forEach((x, i) => anchor(group, `stock-${i}`, [x, .04, -.5]));
    for (let i = 0; i < count; i++) {
      const part = new THREE.Group(); part.name = `count-part-${i}`; part.userData.decorative = true; part.position.set(PAVILION_STOCK[i], .04, -.5); group.add(part);
      box(part, [.85, .55, .85], [0, .275, 0], '#d7b38b', .02); box(part, [.09, .56, .86], [0, .28, 0], '#f2e2c4');
    }
    anchor(group, 'entrance', [0, .04, 1.625]); anchor(group, 'interior', [0, .04, 0]); anchor(group, 'sign', [0, 2.13, -1.489]); anchor(group, 'top', [0, 2.55, 0]);
    return group;
  },
  truck: createTruck,
  tree: (node, context) => {
    // Trunk and crown use the wood and foliage roles; the three crown lobes are fixed shades of the foliage color.
    const p = objectPalette(node, context, 'foliage', { wood: '#a8896a', foliage: '#8bbcaa' }), foliage = new THREE.Color(p.foliage), group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.065, .11, 1.15, 8), new THREE.MeshStandardMaterial({ color: p.wood, roughness: .95 })); trunk.name = 'trunk'; trunk.position.y = .575; trunk.castShadow = true; group.add(trunk);
    // Three faceted lobes read as a leafy crown instead of a single smooth egg; the crown is centred over the trunk.
    for (const [radius, x, y, z, shade] of [[.66, -.04, 1.55, 0, [0, 0, 0]], [.46, .32, 1.28, .16, [-.0006, .0383, -.049]], [.44, -.34, 1.98, -.12, [-.0033, -.0347, .0534]]] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), new THREE.MeshStandardMaterial({ color: foliage.clone().offsetHSL(shade[0], shade[1], shade[2]), roughness: .9, flatShading: true }));
      crown.name = 'foliage'; crown.position.set(x, y, z); crown.scale.y = 1.15; crown.castShadow = true; group.add(crown);
    }
    anchor(group, 'top', [0, 2.49, 0]);
    return group;
  },
};
export const basicAssets: AssetRegistry = Object.fromEntries(Object.entries(models).map(([key, factory]) => [key, (node: AssetNode, context?: MaterialContext) => {
  validateOperatingProperties(node);
  if (node.display !== undefined && !assetDisplayDefinitions[key]) throw new Error(`Asset ${key} has no display configuration.`);
  if (node.countLayout !== undefined && !assetCountLayoutDefaults[key]) throw new Error(`Asset ${key} has no count layout configuration.`);
  if (node.measurement !== undefined && !assetMeasurementDefinitions[key]) throw new Error(`Asset ${key} has no measurement configuration.`);
  if (node.surfaceLabel && !assetLabelSurfaces[key]) throw new Error(`Asset ${key} has no surface label configuration.`);
  if (node.footprint !== undefined && !assetFootprintDefinitions[key]) throw new Error(`Asset ${key} has no footprint configuration.`);
  const object = factory(node, context);
  try {
    if (node.surfaceLabel) applySurfaceLabel(object, node, assetLabelSurfaces[key]);
    if (object.userData.displayBounds instanceof THREE.Box3) object.userData.displayBounds.setFromObject(object);
    return object;
  }
  catch (error) { disposeObject(object); throw error; }
}]));
export function disposeObject(object: THREE.Object3D) {
  disposeSurfaceLabels(object);
  clearAssetAnimator(object);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  object.traverse(child => { if (child instanceof THREE.InstancedMesh) child.dispose(); if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) { geometries.add(child.geometry); const list = Array.isArray(child.material) ? child.material : [child.material]; list.forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
