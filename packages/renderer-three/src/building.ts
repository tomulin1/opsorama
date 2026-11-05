import * as THREE from 'three';
import { BUILDING_PALETTES, BUILDING_SIZE, validateBuilding, type AssetNode, type MaterialOverrides } from '@opsorama/core';
import { anchor, block, part } from './parts';

/** Single-storey exterior styles over one container contract. Contents remain independent scene nodes. */
export function createBuilding(node: AssetNode, context?: { theme: 'light' | 'midnight'; palette?: MaterialOverrides }): THREE.Object3D {
  validateBuilding(node.building ?? {});
  const [width, height, depth] = node.building?.size ?? BUILDING_SIZE;
  const roles = (value?: MaterialOverrides) => ({ ...(value?.surface ? { wall: value.surface } : {}), ...(value?.structure ? { roof: value.structure } : {}), ...(value?.trim ? { trim: value.trim } : {}) });
  const palette = { ...BUILDING_PALETTES[context?.theme ?? 'light'], ...roles(context?.palette), ...(node.color ? { wall: node.color } : {}), ...roles(node.materials), ...node.building?.colors };
  const type = node.building?.type ?? 'generic';
  const group = new THREE.Group(); group.name = 'building';
  const cutaway = (node.building?.view ?? 'closed') !== 'closed', frontCutaway = cutaway && node.building?.cutaway === 'front', thickness = .16, floor = .12;
  // Indoor shadow policy: the shell never darkens its own floor; interior nodes neither cast nor receive.
  block(group, [width, floor, depth], [0, floor / 2, 0], palette.floor, 'building-floor').receiveShadow = false;
  const shell = new THREE.Group(); shell.name = 'building-shell'; group.add(shell);
  // Cut down all walls, so a fixed isometric camera can inspect and select any interior object.
  const pitched = type === 'workshop' || type === 'storage-shed';
  // The pitched roof fits below the same nominal height; size never changes with style.
  const rise = pitched ? Math.min(height * (type === 'storage-shed' ? .28 : .18), width * .2, 1.5) : 0;
  const wallTop = height - rise, wallHeight = cutaway ? .45 : wallTop - floor;
  for (const x of [-width / 2 + thickness / 2, width / 2 - thickness / 2]) { const sideHeight = frontCutaway && x < 0 ? wallTop - floor : wallHeight; block(shell, [thickness, sideHeight, depth], [x, floor + sideHeight / 2, 0], palette.wall, 'building-wall'); }
  const backHeight = frontCutaway ? wallTop - floor : wallHeight;
  block(shell, [width - thickness * 2, backHeight, thickness], [0, floor + backHeight / 2, -depth / 2 + thickness / 2], palette.wall, 'building-wall');
  const industrial = type === 'warehouse' || type === 'workshop' || type === 'storage-shed';
  const doorWidth = industrial ? Math.min(type === 'warehouse' ? 4.5 : 2.5, width * .5) : Math.min(1.5, width / 3), frontWidth = (width - doorWidth) / 2 - thickness;
  for (const x of [-(doorWidth / 2 + frontWidth / 2), doorWidth / 2 + frontWidth / 2]) block(shell, [frontWidth, wallHeight, thickness], [x, floor + wallHeight / 2, depth / 2 - thickness / 2], palette.wall, 'building-wall');
  if (frontCutaway) {
    // Keep far facades and roof edges; near walls remain low so work stays visible.
    block(shell, [width, .2, .65], [0, wallTop, -depth / 2 + .25], palette.roof, 'cutaway-roof-edge');
    block(shell, [.2, .2, depth], [-width / 2 + .08, wallTop, 0], palette.trim, 'cutaway-roof-edge');
    for (const x of [-width / 2 + .08, 0, width / 2 - .08]) block(shell, [.2, wallTop - floor, .2], [x, (wallTop + floor) / 2, -depth / 2 + .12], palette.trim, 'cutaway-column');
    if (type === 'retail' || type === 'office') for (const x of [-width * .3, width * .3]) block(shell, [width * .24, Math.min(1.4, height * .3), .035], [x, height * .58, -depth / 2 + .18], palette.trim, 'cutaway-window', { opacity: .6 });
    else for (let x = -width / 2 + 1; x < width / 2; x += 2) block(shell, [.055, wallTop - floor, .035], [x, (wallTop + floor) / 2, -depth / 2 + .19], palette.trim, 'cutaway-rib');
  }
  if (!cutaway) {
    const doorHeight = Math.min(industrial ? 3 : 2.4, wallTop - .3);
    // A darker plinth band grounds the facade; corner downpipes break up the box silhouette.
    const plinth = `#${new THREE.Color(palette.wall).multiplyScalar(.82).getHexString()}`;
    for (const x of [-width / 2 + thickness / 2, width / 2 - thickness / 2]) block(shell, [thickness + .04, .35, depth + .04], [x, .175, 0], plinth, 'building-plinth');
    block(shell, [width - thickness * 2, .35, thickness + .04], [0, .175, -depth / 2 + thickness / 2], plinth, 'building-plinth');
    for (const x of [-(doorWidth / 2 + frontWidth / 2), doorWidth / 2 + frontWidth / 2]) block(shell, [frontWidth, .35, thickness + .04], [x, .175, depth / 2 - thickness / 2], plinth, 'building-plinth');
    for (const x of [-width / 2 + .12, width / 2 - .12]) block(shell, [.09, wallTop - .1, .09], [x, (wallTop - .1) / 2, depth / 2 + .045], palette.trim, 'building-downpipe');
    block(shell, [doorWidth, wallTop - floor - doorHeight, thickness], [0, floor + doorHeight + (wallTop - floor - doorHeight) / 2, depth / 2 - thickness / 2], palette.wall, 'building-lintel');
    block(shell, [doorWidth, doorHeight, .04], [0, floor + doorHeight / 2, depth / 2 - .03], palette.trim, 'building-door');
    if (pitched) {
      const roof = new THREE.Group(); roof.name = 'building-roof'; shell.add(roof);
      const angle = Math.atan2(rise, width / 2), slope = Math.hypot(width / 2, rise);
      for (const side of [-1, 1]) {
        const panel = block(roof, [slope + .12, .12, depth + .16], [side * width / 4, wallTop + rise / 2 + .08, 0], palette.roof, 'building-roof-panel'); panel.rotation.z = -side * angle;
        const shape = new THREE.Shape(); shape.moveTo(-width / 2, wallTop); shape.lineTo(0, height); shape.lineTo(width / 2, wallTop); shape.closePath();
        const gable = part(shell, new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }), palette.wall, 'building-gable'); gable.position.z = side < 0 ? -depth / 2 : depth / 2 - thickness;
      }
      block(roof, [.09, .09, depth + .18], [0, height + .14, 0], palette.trim, 'building-ridge');
    } else {
      block(shell, [width + .16, .16, depth + .16], [0, height + .08, 0], palette.roof, 'building-roof');
      for (let x = -width / 2 + .3; x < width / 2; x += .7) block(shell, [.025, .025, depth], [x, height + .17, 0], palette.trim, 'building-roof-seam');
    }
    if (industrial) {
      // Closed roller shutters and wall ribs are decorative; they do not encode capacity.
      for (let y = .28; y < floor + doorHeight; y += .22) block(shell, [doorWidth - .06, .025, .025], [0, y, depth / 2 + .004], palette.roof, 'building-shutter-slat');
      for (const side of [-1, 1]) for (let z = -depth / 2 + .3; z < depth / 2; z += .6) block(shell, [.03, wallTop - floor, .035], [side * (width / 2 + .01), (wallTop + floor) / 2, z], palette.trim, 'building-wall-rib');
    }
    if (type === 'office' || type === 'retail' || type === 'workshop') {
      const windowHeight = Math.min(type === 'retail' ? 1.65 : 1.15, wallTop * .34), windowY = floor + (wallTop - floor) * .55;
      for (const side of [-1, 1]) {
        block(shell, [frontWidth * .82, windowHeight, .035], [side * (doorWidth / 2 + frontWidth / 2), windowY, depth / 2 + .025], palette.trim, 'building-window', { opacity: .65, roughness: .15 });
        for (const z of [-depth * .28, depth * .28]) block(shell, [.035, windowHeight, depth * .24], [side * (width / 2 + .025), windowY, z], palette.trim, 'building-window', { opacity: .65, roughness: .15 });
      }
    }
    if (type === 'office') {
      for (const side of [-1, 1]) block(shell, [.1, .18, depth + .1], [side * width / 2, height + .19, 0], palette.trim, 'building-parapet');
      block(shell, [width, .18, .1], [0, height + .19, -depth / 2], palette.trim, 'building-parapet');
    }
    if (type === 'retail') {
      block(shell, [width * .86, .18, .03], [0, wallTop - .35, depth / 2 + .05], palette.trim, 'building-sign-band');
      const awningWidth = width * .9, stripWidth = awningWidth / 10;
      for (let i = 0; i < 10; i++) block(shell, [stripWidth, .08, .55], [-awningWidth / 2 + stripWidth * (i + .5), wallTop - .55, depth / 2 + .25], i % 2 ? palette.trim : palette.roof, 'building-awning');
    }
    if (type === 'distribution-center') {
      // Three fixture bays; quantities, traffic and reservations stay in host data.
      const bayWidth = Math.min(3, width * .23), bayHeight = Math.min(2.8, wallTop - .4);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * width / 3;
        block(shell, [bayWidth, bayHeight, .045], [x, floor + bayHeight / 2, depth / 2 + .045], palette.roof, 'building-dock-door');
        for (const side of [-1, 1]) block(shell, [.07, bayHeight + .1, .1], [x + side * bayWidth / 2, floor + bayHeight / 2, depth / 2 + .06], palette.trim, 'building-dock-frame');
        block(shell, [bayWidth, .1, .28], [x, .17, depth / 2 + .1], palette.trim, 'building-dock-threshold');
      }
    }
  }
  block(group, [doorWidth, .04, .25], [0, .14, depth / 2], palette.trim, 'building-entrance');
  anchor(group, 'interior', [0, floor, 0]); anchor(group, 'entrance', [0, floor, depth / 2 + .2]); anchor(group, 'roof', [0, height + .16, 0]);
  if (type === 'distribution-center') for (let i = 0; i < 3; i++) anchor(group, `dock-${i}`, [(i - 1) * width / 3, floor, depth / 2 + .25]);
  // Stable closed-shell bounds for hover retention: no invisible mesh and no child-picking obstruction.
  group.userData.buildingBounds = new THREE.Box3(new THREE.Vector3(-width / 2 - .08, 0, -depth / 2 - .08), new THREE.Vector3(width / 2 + .08, height + (type === 'office' ? .28 : .19), depth / 2 + (type === 'retail' ? .55 : type === 'distribution-center' ? .25 : .125)));
  return group;
}
