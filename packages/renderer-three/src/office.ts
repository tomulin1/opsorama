import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block, cylinder, merged, part } from './parts';
import { objectPalette, resolveObjectColor } from './object-palette';
import type { MaterialContext } from './laboratory';

const SEAT_HEIGHT = .52, DESK_HEIGHT = .75, FRAME = '#72859e', SURFACE = '#f2f6fb';

/** Swivel chair facing local +z with its seat top at the worker seat height. `frame` colors the base, post, spine and arm posts. */
function chair(group: THREE.Object3D, color: string, frame: string = FRAME): THREE.Group {
  const seat = new THREE.Group(); seat.name = 'office-chair'; group.add(seat);
  // Five-star base with casters; each set is merged into one mesh to keep many chairs cheap.
  const spokes: THREE.BufferGeometry[] = [], casters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    spokes.push(new THREE.BoxGeometry(.05, .035, .3).translate(0, .055, .15).rotateY(i * Math.PI * 2 / 5));
    casters.push(new THREE.SphereGeometry(.03, 8, 6).translate(0, .03, .28).rotateY(i * Math.PI * 2 / 5));
  }
  merged(seat, spokes, frame, 'chair-base', { metalness: .25, roughness: .45 }); merged(seat, casters, '#273545', 'chair-caster');
  cylinder(seat, .035, .38, .24, frame, 'chair-post', { segments: 10, metalness: .3, roughness: .4 });
  block(seat, [.5, .08, .48], [0, SEAT_HEIGHT - .04, 0], color, 'chair-seat', { bevel: .03, roughness: .85 });
  block(seat, [.5, .52, .07], [0, SEAT_HEIGHT + .3, -.24], color, 'chair-back', { bevel: .03, roughness: .85 });
  block(seat, [.06, .26, .03], [0, SEAT_HEIGHT + .06, -.26], frame, 'chair-spine');
  for (const x of [-.27, .27]) { block(seat, [.03, .16, .03], [x, SEAT_HEIGHT + .07, -.04], frame, 'chair-arm'); block(seat, [.05, .03, .28], [x, SEAT_HEIGHT + .16, -.04], '#3a4656', 'chair-arm', { bevel: .01 }); }
  return seat;
}
/** Desk with monitor and keyboard; the user sits on the local +z side facing −z. */
function desk(group: THREE.Object3D): void {
  block(group, [1.4, .05, .75], [0, DESK_HEIGHT - .025, 0], SURFACE, 'desk-top', { bevel: .012, roughness: .5 });
  for (const x of [-.66, .66]) block(group, [.05, DESK_HEIGHT - .05, .68], [x, (DESK_HEIGHT - .05) / 2, 0], FRAME, 'desk-leg');
  block(group, [1.27, .28, .02], [0, DESK_HEIGHT - .25, -.3], FRAME, 'desk-modesty-panel');
  block(group, [.16, .02, .12], [0, DESK_HEIGHT + .01, -.2], '#34475f', 'desk-monitor');
  block(group, [.05, .2, .04], [0, DESK_HEIGHT + .12, -.22], '#34475f', 'desk-monitor');
  block(group, [.62, .38, .04], [0, DESK_HEIGHT + .38, -.24], '#34475f', 'desk-monitor', { bevel: .012 });
  block(group, [.56, .32, .01], [0, DESK_HEIGHT + .38, -.215], '#a9c4e6', 'desk-screen', { roughness: .2 });
  block(group, [.46, .02, .16], [0, DESK_HEIGHT + .01, .12], '#566b86', 'desk-keyboard', { bevel: .006 });
  block(group, [.06, .025, .1], [.33, DESK_HEIGHT + .0125, .14], '#566b86', 'desk-mouse', { bevel: .012 });
}
/** Seat anchor whose +z faces the desk, ready for a seated worker. */
function seatAnchor(group: THREE.Object3D, index: number, position: readonly [number, number, number], facing: number) {
  anchor(group, `seat-${index}`, position).rotation.y = facing;
}

/**
 * The desk-pod and meeting-table chair as its own definition, for reception, lab or lounge layouts.
 * Seat and back use the accent role (color sets it); the frame uses structure. A seat-0 anchor at
 * the worker seat height faces +z, matching the desk-pod seat anchors.
 */
export function createOfficeChair(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'accent', { accent: '#5a7fd6', structure: FRAME }), group = new THREE.Group(); group.name = 'office-chair-asset';
  chair(group, p.accent, p.structure);
  anchor(group, 'seat-0', [0, SEAT_HEIGHT, 0]); anchor(group, 'top', [0, SEAT_HEIGHT + .56, -.24]);
  return group;
}

/**
 * Workstation pod: one desk, or desks back to back in pairs with a privacy screen.
 * `count` is visible workstations (1, 2, 4, 6 or 8), not people or assigned employees.
 */
export function createDeskPod(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pod = new THREE.Group(); pod.name = 'desk-pod';
  const accent = resolveObjectColor(node, context, 'accent', '#5a7fd6');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['desk-pod']);
  const columns = Math.ceil(count / 2), spacing = 1.45;
  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / 2), front = count === 1 || i % 2 === 0, x = (column - (columns - 1) / 2) * spacing;
    // Front desks face −z (user at +z); back desks are rotated to face them across the screen.
    const station = new THREE.Group(); station.name = `count-part-${i}`; station.position.set(x, 0, front ? (count === 1 ? 0 : .4) : -.4); station.rotation.y = front ? 0 : Math.PI; pod.add(station);
    desk(station);
    const seat = chair(station, accent); seat.position.z = .72; seat.rotation.y = Math.PI;
    seatAnchor(pod, i, [x, SEAT_HEIGHT, station.position.z + (front ? .72 : -.72)], front ? Math.PI : 0);
  }
  if (count > 1) block(pod, [columns * spacing - .05, .42, .03], [0, DESK_HEIGHT + .21, 0], accent, 'pod-screen');
  return pod;
}

/** 3.6 m table; `count` places 2–12 chairs in facing pairs centered along the table. Chairs show capacity, not attendees. */
export function createMeetingTable(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const table = new THREE.Group(); table.name = 'meeting-table';
  const accent = resolveObjectColor(node, context, 'accent', '#435b77');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['meeting-table']);
  // Rounded-corner top with a central cable port; same 3.6 × 1.2 m envelope.
  const outline = new THREE.Shape(), [w, d, r] = [1.8, .6, .45];
  outline.moveTo(-w + r, -d); outline.lineTo(w - r, -d); outline.quadraticCurveTo(w, -d, w, -d + r); outline.lineTo(w, d - r); outline.quadraticCurveTo(w, d, w - r, d);
  outline.lineTo(-w + r, d); outline.quadraticCurveTo(-w, d, -w, d - r); outline.lineTo(-w, -d + r); outline.quadraticCurveTo(-w, -d, -w + r, -d);
  const top = part(table, new THREE.ExtrudeGeometry(outline, { depth: .06, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), SURFACE, 'table-top', { roughness: .45 }); top.position.y = DESK_HEIGHT - .06;
  cylinder(table, .08, .008, DESK_HEIGHT + .001, '#34475f', 'table-port', { segments: 16 });
  for (const x of [-1.2, 1.2]) { block(table, [.12, DESK_HEIGHT - .06, .5], [x, (DESK_HEIGHT - .06) / 2, 0], FRAME, 'table-leg', { bevel: .02 }); block(table, [.2, .04, .9], [x, .02, 0], FRAME, 'table-foot', { bevel: .012 }); }
  for (let i = 0; i < count; i++) {
    const x = (Math.floor(i / 2) - (count / 2 - 1) / 2) * .6, side = i % 2 ? 1 : -1;
    // Each chair faces the table: the −z side faces +z and the +z side faces −z.
    const seat = chair(table, accent); seat.name = `count-part-${i}`; seat.position.set(x, 0, side * .95); seat.rotation.y = side > 0 ? Math.PI : 0;
    seatAnchor(table, i, [x, SEAT_HEIGHT, side * .95], side > 0 ? Math.PI : 0);
  }
  return table;
}

const NOTE_TONES = ['#f6dc7a', '#f3b3a6', '#a9d3f0', '#b6e0c2'] as const;
/**
 * Mobile whiteboard facing +z with three ruled columns; `count` fills 0–12 sticky notes column by column.
 * Notes are decorative and share the board's identity. The header strip is a surface-label area.
 */
export function createWhiteboard(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const board = new THREE.Group(); board.name = 'whiteboard';
  const frame = resolveObjectColor(node, context, 'structure', '#7f8fa6');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions.whiteboard);
  for (const x of [-.95, .95]) { block(board, [.05, 1.9, .05], [x, .95, 0], frame, 'board-stand'); block(board, [.08, .04, .6], [x, .02, 0], frame, 'board-stand'); }
  block(board, [1.86, 1.16, .04], [0, 1.33, 0], frame, 'board-frame', { bevel: .015, metalness: .25, roughness: .45 });
  block(board, [1.78, 1.08, .02], [0, 1.33, .025], '#fbfcfe', 'board-surface', { roughness: .2 });
  block(board, [1.6, .04, .1], [0, .76, .06], frame, 'board-tray', { bevel: .01 });
  // Markers and an eraser resting on the tray.
  for (const [i, tone] of ['#d65b5b', '#3f6fd8', '#273545'].entries()) { const marker = cylinder(board, .012, .13, .795, tone, 'board-marker', { segments: 8 }); marker.rotation.z = Math.PI / 2; marker.position.set(.25 + i * .05, .795, .07); }
  block(board, [.14, .04, .05], [-.4, .8, .07], '#3a4656', 'board-eraser', { bevel: .01 });
  for (const x of [-.29, .29]) block(board, [.012, .86, .005], [x, 1.25, .038], '#c3cedc', 'board-rule');
  block(board, [1.7, .012, .005], [0, 1.69, .038], '#c3cedc', 'board-rule');
  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / 4), row = i % 4;
    const note = block(board, [.17, .17, .008], [(column - 1) * .58 + (row % 2 ? .06 : -.06), 1.56 - row * .21, .04], NOTE_TONES[(i + column) % NOTE_TONES.length], `count-part-${i}`);
    note.rotation.z = (i % 3 - 1) * .05;
  }
  anchor(board, 'front', [0, 0, .5]);
  return board;
}

/** Single-person focus booth, 1.1 m square, with a glass door facing +z. The seat anchor faces the back shelf; occupancy is host data. */
export function createFocusPod(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const booth = new THREE.Group(); booth.name = 'focus-pod';
  const panel = resolveObjectColor(node, context, 'surface', '#3f8f7a'), glass = { opacity: .4, roughness: .1 };
  block(booth, [1.1, .06, 1.1], [0, .03, 0], '#c9d4e2', 'pod-floor');
  block(booth, [1.1, 2.1, .04], [0, 1.11, -.53], panel, 'pod-panel');
  for (const x of [-.53, .53]) block(booth, [.04, 2.1, 1.1], [x, 1.11, 0], panel, 'pod-panel');
  block(booth, [1.16, .1, 1.16], [0, 2.21, 0], panel, 'pod-panel', { bevel: .02 });
  block(booth, [.9, 1.1, .02], [0, 1.45, -.5], '#e4eaf2', 'pod-acoustic-panel', { roughness: 1 });
  block(booth, [.8, .03, .02], [0, 2.2, .585], '#273545', 'pod-vent');
  block(booth, [.6, .02, .6], [0, 2.15, 0], '#fff6dc', 'pod-light', { emissive: '#fff6dc' });
  for (const x of [-.5, .5]) block(booth, [.06, 2.1, .06], [x, 1.11, .53], '#34475f', 'pod-door-frame');
  block(booth, [1.06, .06, .06], [0, 2.13, .53], '#34475f', 'pod-door-frame');
  block(booth, [.94, 2, .03], [0, 1.07, .54], '#a9cbe8', 'pod-glass', glass);
  block(booth, [.03, .3, .04], [.36, 1.05, .575], '#d6dee9', 'pod-handle', { metalness: .4, roughness: .3 });
  for (const y of [.4, 1.75]) block(booth, [.05, .1, .04], [-.47, y, .56], '#273545', 'pod-hinge');
  block(booth, [.84, .04, .32], [0, DESK_HEIGHT + .17, -.35], SURFACE, 'pod-shelf');
  cylinder(booth, .18, SEAT_HEIGHT - .06, (SEAT_HEIGHT + .06) / 2, '#435b77', 'pod-stool', { segments: 16, roughness: .9 }).position.z = .1;
  seatAnchor(booth, 0, [0, SEAT_HEIGHT, .1], Math.PI);
  anchor(booth, 'door', [0, 0, .75]);
  return booth;
}
