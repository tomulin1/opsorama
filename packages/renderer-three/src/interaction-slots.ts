import { resolveCountRepresentation, type AssetNode, type InteractionSlot, type InteractionSlotSource } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { BOOTH, DINING_SEATS, DINING_TABLE } from './restaurant';

/**
 * Interaction slots for shared models, in local model coordinates. Seat slots
 * mirror the factories' `anchor-seat-*` layout (tests keep them aligned). A slot
 * holds one agent; groups of slots express capacity. Slots are data only: the
 * host decides who may interact and what the interaction means.
 */
const FACE_BACK = Math.PI;
const seat = (index: number, x: number, z: number, yaw: number, away: number): InteractionSlot => ({
  name: `seat-${index}`, group: 'seat', anchor: `seat-${index}`, pose: 'seated', yaw,
  position: [x, 0, z], approach: [x, 0, z + away],
});
const front = (name: string, group: string, x: number, z: number, pose = 'working'): InteractionSlot => ({
  name, group, pose, yaw: FACE_BACK, position: [x, 0, z], approach: [x, 0, z + .5],
});

/** A position on the −z side facing +z, toward the object or the direction of travel. */
const behind = (name: string, group: string, z: number, pose = 'working'): InteractionSlot => ({
  name, group, pose, yaw: 0, position: [0, 0, z], approach: [0, 0, z - .5],
});

/** A −z position facing +z that is reached from the side, e.g. behind a counter. */
const sideBehind = (name: string, x: number, z: number): InteractionSlot => ({
  name, group: name, pose: 'working', yaw: 0, position: [x, 0, z], approach: [x + .8, 0, z],
});

/** Desk-pod seat layout, matching `createDeskPod`. */
function deskPodSlots(node: AssetNode): InteractionSlot[] {
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['desk-pod']), columns = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const column = Math.floor(i / 2), isFront = count === 1 || i % 2 === 0, x = (column - (columns - 1) / 2) * 1.45;
    const z = (isFront ? (count === 1 ? 0 : .4) : -.4) + (isFront ? .72 : -.72);
    return seat(i, x, z, isFront ? Math.PI : 0, isFront ? .55 : -.55);
  });
}
/** Meeting-table seat layout, matching `createMeetingTable`. */
function meetingTableSlots(node: AssetNode): InteractionSlot[] {
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['meeting-table']);
  return Array.from({ length: count }, (_, i) => {
    const x = (Math.floor(i / 2) - (count / 2 - 1) / 2) * .6, side = i % 2 ? 1 : -1;
    return seat(i, x, side * .95, side > 0 ? Math.PI : 0, side * .55);
  });
}

/** Dining-table seat layout, matching `createDiningTable`: one seat per side, approached from outside. */
function diningTableSlots(node: AssetNode): InteractionSlot[] {
  const offset = DINING_TABLE.chairOffset + (node.variant === 'round' ? .03 : 0);
  return DINING_SEATS.map(([x, z, yaw], i) => ({ ...seat(i, x * offset, z * offset, yaw, 0), approach: [x * (offset + .55), 0, z * (offset + .55)] as const }));
}

export const assetInteractionSlots: Readonly<Record<string, InteractionSlotSource>> = Object.freeze({
  /** Two pick faces on the +z side of the rack. */
  shelf: () => [front('pick-0', 'pick', -.75, .9), front('pick-1', 'pick', .75, .9)],
  /** One work position at the +z edge of the bench, facing the monitor. */
  station: () => [front('work', 'work', 0, 1.05)],
  'parcel-locker': () => [front('use', 'use', 0, .85)],
  /** Pusher behind the handle, facing the direction of travel (+z). */
  'picking-cart': () => [behind('push', 'push', -.95)],
  /** Put from the back (−z), pick from the front (+z). */
  'put-wall': () => [behind('put', 'put', -.65), front('pick', 'pick', 0, .65)],
  'roll-cage': () => [front('load', 'load', 0, .75)],
  'parcel-scale': () => [front('weigh', 'weigh', 0, .6)],
  'hold-cage': () => [front('access', 'access', .5, 1.25)],
  /** Staff work behind the counter and are reached from the side; customers queue in front. */
  'click-collect-counter': () => [sideBehind('staff', .6, -.55), front('customer', 'customer', 0, .85, 'idle')],
  'checkout-counter': () => [sideBehind('cashier', .55, -.7), front('customer', 'customer', 0, .8, 'idle')],
  'store-shelving': () => [front('browse', 'browse', 0, .75, 'idle')],
  whiteboard: () => [front('present', 'present', 0, .8, 'idle')],
  /** Operator in front of the control pendant, facing the machine. */
  'machine-tool': () => [front('operate', 'operate', .2, 1.25)],
  /** Driver at the holster side of the pedestal. */
  'ev-charger': () => [front('plug', 'plug', .12, .7, 'idle')],
  /** Carer beside the bed on the +x side, facing the patient. */
  'hospital-bed': (): InteractionSlot[] => [{ name: 'care', group: 'care', pose: 'working', yaw: -Math.PI / 2, position: [.75, 0, 0], approach: [1.3, 0, 0] }],
  'service-cart': () => [behind('push', 'push', -.7)],
  'kitchen-station': () => [front('cook', 'cook', 0, .75)],
  'exhibition-booth': () => [front('visit', 'visit', 0, 2, 'idle')],
  /** Forklift or reach truck in front of the bay; pickers work the carton flow rack from the front and replenish at the back. */
  'pallet-rack': () => [front('load', 'load', 0, 1.9)],
  'carton-flow-rack': () => [front('pick', 'pick', 0, .95), behind('replenish', 'replenish', -.95)],
  'stretch-wrapper': () => [front('operate', 'operate', 1.45, .8)],
  /** Restaurant seats and service positions; guests, covers and orders remain host records. */
  'dining-table': diningTableSlots,
  'booth-seating': () => BOOTH.seats.map(([x, z, yaw], i) => ({ ...seat(i, x, z, yaw, 0), approach: [x < 0 ? -1.05 : 1.05, 0, z] as const })),
  'bar-counter': () => [sideBehind('bartender', 0, -.7)],
  'heated-pass': () => [behind('plate', 'plate', -.75), front('pickup', 'pickup', 0, .75)],
  'pickup-shelf': () => [front('collect', 'collect', 0, .7, 'idle')],
  'host-stand': () => [behind('host', 'host', -.55, 'idle')],
  'pizza-oven': () => [front('cook', 'cook', 0, 1.35)],
  'walk-in-cooler': () => [front('access', 'access', -.35, 1.4)],
  'dish-machine': () => [front('operate', 'operate', 0, .8)],
  /** Pool plant and deck service positions; bookings and maintenance remain host records. */
  'dosing-station': () => [front('service', 'service', 0, .75)],
  'sand-filter': () => [front('service', 'service', 0, .9)],
  'deck-shower': () => [front('shower', 'shower', 0, .15, 'idle')],
  'desk-pod': deskPodSlots,
  /** One seat, reached from the front (+z). */
  'office-chair': () => [seat(0, 0, 0, 0, .6)],
  'meeting-table': meetingTableSlots,
  bench: () => [-.4, .4].map((x, i) => seat(i, x, 0, 0, .6)),
  'focus-pod': () => [{ ...seat(0, 0, .1, Math.PI, .85), approach: [0, 0, 1] as const }],
});
