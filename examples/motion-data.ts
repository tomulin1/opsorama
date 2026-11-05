import { behaviorNode, commandSteps, createBehaviorRunner, createHandlingState, itemNode, createNavGraph, navGraphOverlay, resolveSceneSlots, slotNavPoints, toNodeRoute, type AgentCommand, type AgentState, type AssetNode, type CarryRule, type ControllerFactory, type ControllerRegistry, type BehaviorStep, type RouteViolation, type SceneNode, type SceneOverlay, type Vec3 } from '@opsorama/core';
import { assetHandling, assetInteractionSlots, assetMotionProfiles, handlingProfiles } from '@opsorama/renderer-three';

/** Walkway tiles are 9.5 cm tall; agents and graph points stand on top of them. */
const Y = .1;

/** Fixtures with interaction slots: two shelf pick faces, one packing position, one desk seat and two bench seats. */
export const motionFixtures: readonly AssetNode[] = [
  { id: 'shelf-unit', kind: 'asset', asset: 'shelf', position: [-5, 0, -4.4], count: 4 },
  { id: 'packing-desk', kind: 'asset', asset: 'station', position: [.5, 0, -4.4] },
  { id: 'office-desk', kind: 'asset', asset: 'desk-pod', position: [5.5, 0, -4.4], count: 1 },
  { id: 'break-bench', kind: 'asset', asset: 'bench', position: [3.5, 0, -.2] },
];
export const motionSlots = resolveSceneSlots(motionFixtures, assetInteractionSlots, { lift: Y });

const walk = (id: string, x: number): { id: string; position: Vec3 } => ({ id, position: [x, Y, -1.6] });
const walkway = [walk('walk-west', -6), walk('walk-shelf-a', -5.75), walk('walk-shelf-b', -4.25), walk('walk-pack', .5), walk('walk-lounge', 2.2), walk('walk-queue', 2.6), walk('walk-office', 5.5), walk('walk-east', 6)];

/** A narrow walkway spur: one person at a time, in either direction. */
const spur = (from: string, to: string) => ({ from, to, lane: 'walkway', capacity: 1 });

/**
 * Walkways and slot spurs for people, a one-way vehicle loop, and service crossings only vehicles may use.
 * The main walkway is wide enough to pass; spurs, single-slot approaches and queue places hold one person,
 * so people give way instead of walking through each other. The queue is joined from its back.
 */
export const motionGraph = createNavGraph({
  points: [
    ...walkway, ...slotNavPoints(motionSlots).map(point => point.id.startsWith('break-bench:') ? point : { ...point, capacity: 1 }),
    { id: 'queue-1', position: [1.6, Y, -2.85], label: 'Packing queue 1', capacity: 1 }, { id: 'queue-2', position: [2.6, Y, -2.85], label: 'Packing queue 2', capacity: 1 },
    { id: 'lounge', position: [2.2, Y, .4] }, { id: 'lounge-rest', position: [1.6, Y, .4], label: 'Rest spot beside the bench path' },
    { id: 'lane-nw', position: [-7, Y, 2.6] }, { id: 'lane-n-west', position: [-6, Y, 2.6] }, { id: 'lane-n-east', position: [6, Y, 2.6] }, { id: 'lane-ne', position: [7, Y, 2.6] }, { id: 'lane-se', position: [7, Y, 4.6] }, { id: 'lane-sw', position: [-7, Y, 4.6] },
  ],
  edges: [
    ...walkway.slice(1).map((point, index) => ({ from: walkway[index].id, to: point.id, lane: 'walkway' })),
    spur('walk-shelf-a', 'shelf-unit:pick-0'), spur('walk-shelf-b', 'shelf-unit:pick-1'), spur('walk-pack', 'packing-desk:work'), spur('walk-office', 'office-desk:seat-0'),
    spur('walk-queue', 'queue-2'), spur('queue-2', 'queue-1'), spur('queue-1', 'packing-desk:work'), spur('walk-lounge', 'lounge'),
    { from: 'lounge', to: 'lounge-rest', lane: 'walkway' }, { from: 'lounge', to: 'break-bench:seat-0', lane: 'walkway' }, { from: 'break-bench:seat-0', to: 'break-bench:seat-1', lane: 'walkway' },
    { from: 'lane-nw', to: 'lane-n-west', lane: 'vehicle', oneWay: true }, { from: 'lane-n-west', to: 'lane-n-east', lane: 'vehicle', oneWay: true }, { from: 'lane-n-east', to: 'lane-ne', lane: 'vehicle', oneWay: true },
    { from: 'lane-ne', to: 'lane-se', lane: 'vehicle', oneWay: true }, { from: 'lane-se', to: 'lane-sw', lane: 'vehicle', oneWay: true }, { from: 'lane-sw', to: 'lane-nw', lane: 'vehicle', oneWay: true },
    { from: 'walk-west', to: 'lane-n-west', lane: 'service' }, { from: 'walk-east', to: 'lane-n-east', lane: 'service' },
  ],
  lanes: { walkway: { allow: ['person'] }, vehicle: { allow: ['vehicle'], speedLimit: 2 }, service: { allow: ['vehicle'] } },
  // Catalog profiles: people brake and turn in place at sharp corners; the pallet jack slows down for corners.
  agents: { person: assetMotionProfiles.worker, vehicle: assetMotionProfiles['pallet-jack'] },
});

const tile = (id: string, center: readonly [number, number], size: readonly [number, number], color: string): SceneNode => ({ id, kind: 'zone', position: [center[0], 0, center[1]], size, color });
const WALK = '#b9e0c6', LANE = '#f0d49c', SERVICE = '#efc2c2';
const vehiclePlan = motionGraph.plan({ agent: 'vehicle', from: 'lane-nw', via: ['lane-ne', 'lane-se', 'lane-sw'], to: 'lane-nw' });
if (!vehiclePlan.ok) throw new Error('The example vehicle loop must be permitted.');

/** Static scene: floor tiles for each lane and fixtures. The looping pallet jack is `palletJackNode`. */
export const motionSceneNodes: readonly SceneNode[] = [
  { id: 'floor', kind: 'ground', size: [18, 13] },
  tile('walkway', [0, -1.6], [12.9, .9], WALK), tile('spur-pick-0', [-5.75, -2.9], [.9, 1.7], WALK), tile('spur-pick-1', [-4.25, -2.9], [.9, 1.7], WALK),
  tile('spur-pack', [.5, -2.75], [.9, 1.4], WALK), tile('queue-area', [2, -2.85], [2.1, .9], WALK), tile('spur-queue', [2.6, -2.225], [.9, .35], WALK),
  tile('spur-office', [5.5, -2.6], [.9, 1.1], WALK), tile('spur-lounge', [2.2, -.6], [.9, 1.1], WALK), tile('lounge-area', [2.85, .4], [3, .9], WALK),
  tile('vehicle-north', [0, 2.6], [14.9, .9], LANE), tile('vehicle-south', [0, 4.6], [14.9, .9], LANE), tile('vehicle-east', [7, 3.6], [.9, 1.1], LANE), tile('vehicle-west', [-7, 3.6], [.9, 1.1], LANE),
  tile('service-west', [-6, .5], [.9, 3.3], SERVICE), tile('service-east', [6, .5], [.9, 3.3], SERVICE),
  ...motionFixtures,
];
const palletJackLoop = toNodeRoute(vehiclePlan.route, { loop: true });
/**
 * The pallet jack looping on its own lane. `time` is the host clock (here the
 * runner's), so a scene mounted again resumes the loop where it is instead of
 * restarting it at the first corner.
 */
export function palletJackNode(time = 0): AssetNode {
  return { id: 'pallet-jack', kind: 'asset', asset: 'pallet-jack', label: 'Pallet jack', labelMode: 'active', selectable: true, position: [-7, Y, 2.6], route: { ...palletJackLoop, elapsed: time } };
}

/** Seconds a parcel takes to move between a shelf or bench and a picker's hands. */
const PARCEL_HAND_OVER = .6;
/**
 * Pickers hold one parcel in front of them; the worker's `holding` pose has no built-in box.
 * Parcels change hands before the interaction ends, so the hand-over animation finishes as the picker leaves.
 */
const pickerCarry: CarryRule = { anchor: 'carry', travelPose: 'holding', idlePose: 'holding', handOverSeconds: PARCEL_HAND_OVER, reach: 1.2 };
/** Order parcels are real inventory on the shelf's middle-level storage slots; its four decorative boxes stay on the bottom level. */
const SHELF_ORDERS = 3;
const onShelf = { container: 'shelf-unit', receptacle: 'level-1' };
/** Parcels pile up on the packing bench's surface in front of the work position when several wait. */
const PACK_SPOT = { receptacle: 'surface' };

/** Take the oldest order parcel from the shelf, carry it to the packing desk and leave it on the bench. */
export const shiftSteps: readonly BehaviorStep[] = [
  { kind: 'interact', node: 'shelf-unit', group: 'pick', seconds: [2, 4], pose: 'picking', pickUp: 1, label: 'Picking' },
  { kind: 'interact', node: 'packing-desk', group: 'work', seconds: [3, 4.5], queue: ['queue-1', 'queue-2'], pose: 'placing', putDown: 'all', putOn: PACK_SPOT, label: 'Packing' },
];
/**
 * A host goal instead of a script: use any free bench seat, then wait beside the
 * bench path. The agent plans a permitted route, takes the nearest free seat (or
 * queues) and turns by itself; the world position resolves to the nearest point.
 */
export const breakCommand: AgentCommand = {
  interact: { node: 'break-bench', group: 'seat', seconds: 8 }, label: 'On a break',
  then: [{ kind: 'move', to: { position: [1.6, 0, .5] }, label: 'Waiting for instructions' }],
};
export const breakSteps: readonly BehaviorStep[] = commandSteps(breakCommand);
const officeSteps: readonly BehaviorStep[] = [
  { kind: 'interact', node: 'office-desk', group: 'seat', seconds: 12, label: 'Desk work' },
  { kind: 'interact', node: 'break-bench', group: 'seat', seconds: [5, 7], label: 'Coffee break' },
];

export const motionPeople = [
  { id: 'alex', name: 'Alex', color: '#6c9be0' }, { id: 'blake', name: 'Blake', color: '#7ba88b' },
  { id: 'casey', name: 'Casey', color: '#d4a758' }, { id: 'devon', name: 'Devon', color: '#9784c5' },
] as const;

/** Packed parcels wait on the bench until this many are there; then the oldest ships. */
export const PACKED_ON_BENCH = 2;

/**
 * A seeded runner for the scripted shift; the host advances it with the scene's speed and pause.
 * The host owns the orders: it adds a new order parcel to the shelf when one is picked, and ships
 * (removes) the oldest packed parcel when the bench holds more than `PACKED_ON_BENCH`.
 */
export function createShift(seed = 3) {
  // The shared handling state knows every parcel; agents and host rules move them through its checks.
  const handling = createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances: [
    { id: 'shelf-unit', asset: 'shelf' }, { id: 'packing-desk', asset: 'station' },
    ...(['alex', 'blake', 'casey'] as const).map(id => ({ id, asset: 'worker' })),
  ] });
  let nextOrder = 1;
  const addOrder = () => { const id = `order-${nextOrder++}`; handling.register([{ id, asset: 'parcel' }]); handling.move([{ unit: id, to: onShelf }]); };
  for (let i = 0; i < SHELF_ORDERS; i++) addOrder();
  return createBehaviorRunner({ graph: motionGraph, slots: motionSlots, seed, handling,
    // Host rules run at the event's simulation time, so the shift is the same at any frame rate.
    onItemEvent: (event, items) => {
      if (event.type === 'picked-up' && event.node === 'shelf-unit') event.items.forEach(addOrder);
      if (event.type === 'put-down' && event.node === 'packing-desk') {
        const packed = [...items.getItems()].filter(([, at]) => 'node' in at && at.node === 'packing-desk').map(([id]) => id);
        for (const id of packed.slice(0, Math.max(0, packed.length - PACKED_ON_BENCH))) handling.unregister(id);
      }
    },
    agents: [
      { id: 'alex', agent: 'person', start: 'walk-shelf-a', steps: shiftSteps, loop: true, carry: pickerCarry },
      { id: 'blake', agent: 'person', start: 'walk-shelf-b', steps: shiftSteps, loop: true, carry: pickerCarry },
      { id: 'casey', agent: 'person', start: 'walk-pack', steps: shiftSteps, loop: true, carry: pickerCarry },
      { id: 'devon', agent: 'person', start: 'walk-office', steps: officeSteps, loop: true },
    ] });
}

/** Order parcels as scene nodes: attached to a picker's carry anchor, or resting on the shelf or bench. */
export function itemNodes(items: ReturnType<ReturnType<typeof createShift>['getItems']>): AssetNode[] {
  return [...items].map(([id, at]) => itemNode(id, at, { asset: 'parcel', scale: [.4, .4, .4], transfer: { seconds: PARCEL_HAND_OVER } }));
}

/** Workers for the scene; with the runner's `time`, a newly mounted scene shows walking agents mid-route. */
export function agentNodes(agents: readonly AgentState[], time?: number): AssetNode[] {
  return agents.map(state => { const person = motionPeople.find(item => item.id === state.id)!; return behaviorNode(state, { asset: 'worker', label: person.name, color: person.color, selectable: true }, { time }); });
}

export function shiftOverlay(runner: ReturnType<typeof createShift>): SceneOverlay {
  return navGraphOverlay(motionGraph, { slots: motionSlots, reservations: runner.getReservations(), holds: runner.getHolds(), time: runner.time, routes: runner.getAgents().flatMap(agent => agent.route && agent.phase === 'moving' ? [agent.route] : []), laneColors: { walkway: '#3c8dbc', vehicle: '#d9922e', service: '#c45a8a' } });
}

/** A host-proposed route over the service crossings and vehicle lane; the rules reject it for people. */
export const vehicleLaneProposal = ['walk-shelf-a', 'walk-west', 'lane-n-west', 'lane-n-east', 'walk-east', 'walk-office'] as const;
export function checkVehicleLaneProposal(): readonly RouteViolation[] { return motionGraph.check('person', vehicleLaneProposal); }

/** Spots the host can send the delivery robot to, in the open floor between the walkway and the vehicle lane. */
export const ROBOT_SPOTS: readonly { name: string; position: Vec3 }[] = [
  { name: 'Charger', position: [-4.4, 0, -.3] }, { name: 'Pick-up point', position: [-1, 0, -.3] }, { name: 'Drop-off point', position: [-2.7, 0, .9] },
];

const finitePoint = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
/**
 * A host-defined controller, registered like an asset factory: drive back and forth between
 * `from` and `to` at `speed`, turning around during a `pause` at each end. It is a pure function
 * of its own clock, so pause, speed and motion-off behave like the built-in controllers.
 */
const shuttle: ControllerFactory = options => {
  const { from, to } = options, speed = Number(options.speed ?? .8), pause = Number(options.pause ?? 1.5);
  if (!finitePoint(from) || !finitePoint(to)) throw new Error('Controller shuttle requires from and to points.');
  if (!(speed > 0) || !(pause >= 0)) throw new Error('Controller shuttle requires a positive speed and a non-negative pause.');
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]), leg = length / speed, out = Math.atan2(to[0] - from[0], to[2] - from[2]);
  let clock = 0;
  const at = (time: number) => {
    const phase = time % (2 * (leg + pause)), back = phase >= leg + pause, local = back ? phase - leg - pause : phase;
    const [start, end] = back ? [to, from] : [from, to], heading = back ? out + Math.PI : out;
    if (local < leg) { const t = local / leg; return { position: [start[0] + (end[0] - start[0]) * t, start[1], start[2] + (end[2] - start[2]) * t] as Vec3, yaw: heading, moving: true }; }
    // Turn around on the spot during the pause.
    return { position: end, yaw: heading + Math.PI * (pause > 0 ? (local - leg) / pause : 1), moving: false };
  };
  return { update: ({ delta }) => at(clock += delta), settle: () => ({ ...at(clock), moving: false }) };
};
/** Controllers the example adds to `basicControllers`; every adapter passes them to the renderer. */
export const motionControllers: ControllerRegistry = { shuttle };

/**
 * Host-driven machines. The host only sets where the delivery robot should be; `approach` drives
 * it there with its own speed, braking and turning. A cart follows it with `follow`, and a second
 * robot runs the host-defined `shuttle` controller. Controllers ignore movement-graph rules.
 */
export function robotNodes(spot: number): AssetNode[] {
  return [
    { id: 'delivery-robot', kind: 'asset', asset: 'mobile-robot', variant: 'tote', label: 'Delivery robot', labelMode: 'active', selectable: true, position: ROBOT_SPOTS[spot % ROBOT_SPOTS.length].position, controller: { kind: 'approach', options: { speed: 1.2, acceleration: .8, turnRate: 2.5 } } },
    { id: 'robot-cart', kind: 'asset', asset: 'picking-cart', count: 2, label: 'Towed cart', labelMode: 'active', selectable: true, position: [-4.4, 0, -1.4], controller: { kind: 'follow', options: { target: 'delivery-robot', distance: 1.25, speed: 1.6, acceleration: 1.2, turnRate: 3 } } },
    { id: 'shuttle-robot', kind: 'asset', asset: 'mobile-robot', label: 'Shuttle robot', labelMode: 'active', selectable: true, position: [-4.8, 0, 1.75], controller: { kind: 'shuttle', options: { from: [-4.8, 0, 1.75], to: [-.6, 0, 1.75], speed: .7, pause: 2 } } },
  ];
}
