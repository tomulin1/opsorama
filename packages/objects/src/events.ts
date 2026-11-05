import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, wires } from './parts';
import { kitPalette, truss } from './kit';

/**
 * Event stage, 8 × 5 m and 1 m high, facing the audience at +z, with a truss roof frame, rear LED screen, hanging
 * line-array speakers and spotlights. The screen is a surface-label area; programme and audience data stay with the host.
 * Color changes the stage skirt.
 */
export function createEventStage(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), skirt = node.materials?.accent ?? node.color ?? p.accent, lacing: number[] = [];
  const stage = new THREE.Group(); stage.name = 'event-stage';
  block(stage, [8, .95, 5], [0, .475, 0], p.structure, 'stage-deck-frame');
  block(stage, [8, .05, 5], [0, .975, 0], p.screen, 'stage-deck', { roughness: .85 });
  block(stage, [8.02, .9, .02], [0, .47, 2.51], skirt, 'stage-skirt', { roughness: .9 });
  for (const x of [-4.01, 4.01]) block(stage, [.02, .9, 5], [x, .47, 0], skirt, 'stage-skirt', { roughness: .9 });
  for (let i = 0; i < 3; i++) block(stage, [.9, .25 * (i + 1), .35], [4.5, .125 * (i + 1), 1.9 - i * .35], p.structure, 'stage-step');
  for (const x of [-3.8, 3.8]) for (const z of [-2.2, 2.2]) truss(stage, lacing, 'y', 1, 6, [x, 0, z], .15, .5, p.trim, 'stage-truss', .04, { metalness: .3, roughness: .4 });
  for (const z of [-2.2, 2.2]) truss(stage, lacing, 'x', -3.65, 3.65, [0, 6.15, z], .15, .5, p.trim, 'stage-truss', .04, { metalness: .3, roughness: .4 });
  for (const x of [-3.8, 3.8]) truss(stage, lacing, 'z', -2.05, 2.05, [x, 6.15, 0], .15, .5, p.trim, 'stage-truss', .04, { metalness: .3, roughness: .4 });
  wires(stage, lacing, p.trim, 'stage-truss-lacing');
  block(stage, [6.2, 3.2, .12], [0, 3, -2.38], p.structure, 'stage-screen-frame', { bevel: .03 });
  block(stage, [6, 3, .02], [0, 3, -2.31], p.screen, 'stage-screen', { roughness: .2 });
  // Line arrays hang in a gentle curve from the front truss; spotlights point down at the deck.
  for (const x of [-3.35, 3.35]) for (let i = 0; i < 4; i++) block(stage, [.6, .22, .45], [x, 5.6 - i * .24, 2.35 + i * .03], p.screen, 'stage-speaker', { bevel: .02 }).rotation.x = i * .06;
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i, light = cylinder(stage, .1, .26, 0, p.screen, 'stage-light', { segments: 12 }); light.rotation.x = -.5; light.position.set(x, 5.85, 2.1);
    const lens = cylinder(stage, .085, .01, 0, '#fff2cc', 'stage-light-lens', { segments: 12, emissive: '#fff2cc' }); lens.rotation.x = -.5; lens.position.set(x, 5.73, 2.03);
  }
  for (const x of [-1.5, 1.5]) block(stage, [.5, .3, .4], [x, 1.12, 2.15], p.screen, 'stage-monitor', { bevel: .02 }).rotation.x = -.35;
  anchor(stage, 'stage', [0, 1, 0]); anchor(stage, 'audience', [0, 0, 6]);
  return stage;
}

/**
 * Exhibition booth on a 3 × 3 m raised floor facing +z: back and side walls, header band (surface-label area), wall screen,
 * counter, brochure stand, roll-up banner and spotlights. Leads and visitors stay host data. Color changes the brand accents.
 */
export function createExhibitionBooth(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), brand = node.materials?.accent ?? node.color ?? p.accent;
  const booth = new THREE.Group(); booth.name = 'exhibition-booth';
  block(booth, [3, .08, 3], [0, .04, 0], p.structure, 'booth-floor', { roughness: 1 });
  block(booth, [3, 2.5, .08], [0, 1.33, -1.46], p.surface, 'booth-back-wall', { roughness: .6 });
  block(booth, [.08, 2.5, 1.5], [-1.46, 1.33, -.75], p.surface, 'booth-side-wall', { roughness: .6 });
  block(booth, [3.02, .42, .12], [0, 2.4, -1.44], brand, 'booth-header', { bevel: .02 });
  block(booth, [1.3, .78, .05], [.5, 1.55, -1.4], p.structure, 'booth-screen-frame', { bevel: .015 });
  block(booth, [1.22, .7, .02], [.5, 1.55, -1.37], p.screen, 'booth-screen', { roughness: .2 });
  block(booth, [1.1, .95, .5], [.55, .555, .7], p.surface, 'booth-counter', { bevel: .03, roughness: .5 });
  block(booth, [1.2, .04, .6], [.55, 1.05, .7], p.trim, 'booth-counter-top', { bevel: .01 });
  block(booth, [1, .5, .02], [.55, .62, .96], brand, 'booth-counter-panel');
  cylinder(booth, .02, 1.1, .63, p.trim, 'booth-brochure-stand', { segments: 8 }).position.set(-1.05, .63, 1.1);
  block(booth, [.32, .45, .08], [-1.05, 1.1, 1.13], p.trim, 'booth-brochure-stand').rotation.x = -.25;
  for (let i = 0; i < 3; i++) block(booth, [.22, .3, .01], [-1.05, 1.05 + i * .02, 1.18 - i * .012], ['#fbfcfe', '#e3c27a', '#9fcdb8'][i], 'booth-brochure').rotation.x = -.25;
  block(booth, [.62, .07, .22], [1.15, .115, 1.25], p.structure, 'booth-banner-base', { bevel: .02 });
  block(booth, [.56, 1.85, .01], [1.15, 1.08, 1.25], brand, 'booth-banner');
  block(booth, [.56, .35, .012], [1.15, 1.8, 1.256], '#fbfcfe', 'booth-banner-header');
  for (const x of [-.9, 0, .9]) {
    block(booth, [.03, .03, .5], [x, 2.63, -1.2], p.structure, 'booth-light-arm');
    const spot = cylinder(booth, .06, .14, 0, p.structure, 'booth-spotlight', { segments: 12 }); spot.rotation.x = .6; spot.position.set(x, 2.58, -.96);
  }
  const grid: number[] = []; for (let x = -1.2; x <= 1.21; x += .6) grid.push(x, .081, -1.42, x, .081, 1.48); wires(booth, grid, '#4b5a6e', 'booth-carpet-seam');
  anchor(booth, 'visitor', [0, 0, 2]); anchor(booth, 'staff', [.55, .08, .2]);
  return booth;
}
