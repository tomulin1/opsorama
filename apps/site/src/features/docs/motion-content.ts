import type { DocArticle } from './content';

export const routeRow = ['route', 'NodeRoute', 'none', 'Visual route that owns the root position and heading while present: points, speed, optional segmentSpeeds, timed stops, loop, endYaw, startYaw, startSpeed and a motion profile. Plan it with createNavGraph and toNodeRoute. See /docs/motion.'];

export const motionArticle: DocArticle = {
  slug: 'motion', title: 'Motion & routes', category: 'FOUNDATIONS', description: 'Move people and vehicles only where your movement rules allow, with deterministic planning and replacement that never jumps.',
  sections: [
    { id: 'layers', title: 'How movement is structured', paragraphs: ['Movement is split into four layers: a movement graph (where agents may go), interaction slots on objects (where and how one agent interacts), a behavior runner with reservations and queues (what agents do next), and route following (where the agent is now). The first three are framework-free core code; the shared renderer follows routes on its visual clock and can draw a debug overlay.', 'The graph expresses spatial and visual policy only. Business rules, permissions and commands stay in your host application, which decides when an agent gets a new destination.'] },
    { id: 'graph', title: 'Movement graph', paragraphs: ['createNavGraph({ points, edges, lanes?, agents? }) validates the definition and returns a NavGraph. Edges are two-way unless oneWay is set. An edge can name a lane and add its own allow list, cost multiplier and speed limit; lanes add allow lists and speed limits; every agent kind declares a speed. Both the edge and its lane must allow an agent. Points, edges and lanes may also set a capacity; see "Capacity and yielding" below.'], code: `import { createNavGraph, toNodeRoute } from '@opsorama/core';\n\nconst floor = createNavGraph({\n  points: [\n    { id: 'shelf', position: [-6, 0.1, -3.4] },\n    { id: 'aisle', position: [-6, 0.1, -1] },\n    { id: 'desk', position: [0, 0.1, -1] },\n  ],\n  edges: [\n    { from: 'shelf', to: 'aisle', lane: 'walkway' },\n    { from: 'aisle', to: 'desk', lane: 'walkway' },\n  ],\n  lanes: { walkway: { allow: ['person'] } },\n  agents: { person: { speed: 1.3 } },\n});\n\nconst plan = floor.plan({ agent: 'person', from: 'shelf', to: 'desk' });\nif (plan.ok) {\n  store.upsert({ id: 'picker', kind: 'asset', asset: 'worker',\n    variant: 'walking', position: [0, 0.1, -1],\n    route: toNodeRoute(plan.route, { endYaw: Math.PI,\n      stops: [{ waypoint: 1, seconds: 2 }] }) });\n} else {\n  showViolations(plan.violations);\n}`, language: 'typescript' },
    { id: 'planning', title: 'Planning and checking', headers: ['Method', 'Result', 'Notes'], rows: [
      ['plan({ agent, from, to, via?, avoidLanes?, penalty? })', '{ ok: true, route: PlannedRoute } | { ok: false, violations }', 'Cheapest permitted route by length × cost. via points are visited in order. penalty(from, to) adds a non-negative cost per move (Infinity forbids it). PlannedRoute lists point IDs, positions, steps (lane, length, permitted speed), waypoint indices, length and travel duration.'],
      ['check(agent, pointIds)', 'readonly RouteViolation[]', 'Validates a route proposed by the host. Codes: unknown-agent, unknown-point, missing-edge, wrong-direction, agent-not-allowed. An empty array means the route is permitted.'],
      ['edge(from, to) / capacity(point) / capacity(from, to)', 'NavEdge | undefined / number', 'The edge that permits a move (both directions share one object), and the capacity of a point or edge (edge, then lane; Infinity when unlimited).'],
      ['toNodeRoute(route, { loop?, endYaw?, stops? })', 'NodeRoute', 'Turns lane/edge limits into segmentSpeeds. stops refer to request waypoints (0 = from, then via, last = to), so pass-through points never pause.'],
    ] },
    { id: 'route', title: 'Route following', headers: ['NodeRoute field', 'Type', 'Meaning'], rows: [
      ['points', 'Vec3[] (2–512)', 'World-space points in travel order.'],
      ['speed', 'number (0–30 m/s)', 'Default travel speed in metres per visual second.'],
      ['segmentSpeeds', 'number[]', 'Optional speed per segment, e.g. lane limits.'],
      ['stops', '{ index, seconds, yaw? }[]', 'Timed pauses at route points, optionally facing a heading.'],
      ['loop', 'boolean', 'Restart after the last point; the route must end at its first point.'],
      ['endYaw', 'number (radians)', 'Heading after a one-way route ends. 0 faces +z, the catalog front.'],
      ['profile', 'MotionProfile', 'Optional kinematics of the agent kind: acceleration, turnRate, turnInPlaceAngle, cornerSpeed, cornerRadius. Copied from the graph agent rule.'],
      ['startYaw / startSpeed', 'number', 'Heading and speed before the first point; a profile with turnRate turns in place first. Ignored by loops.'],
      ['elapsed', 'seconds (≥ 0)', 'Progress already travelled when a renderer first takes the route, e.g. after a remount; loops wrap. Not part of the route identity, so a renderer that already follows the route keeps its own progress. behaviorNode(state, base, { time: runner.time }) sets it.'],
    ], paragraphs: ['While a node has a route, the route owns its root position and heading; position remains the host record position and applies again when route is removed. Route changes never rebuild the model. Local animators receive locomotion.moving: route-driven workers walk in place while travelling and stand at stops.'] },
    { id: 'profiles', title: 'Motion profiles: how each agent kind moves', paragraphs: ['Each agent kind can declare its own movement rules next to its speed. Without a profile, speed changes and turns are instant, which is the previous behavior. Because the profile travels with the route, routeDuration and sampleRoute include acceleration and turns, so the behavior runner and the renderer agree on arrival times.', 'assetMotionProfiles in @opsorama/renderer-three provides readable defaults for worker, mobile-robot, pallet-jack, forklift, reach-truck, picking-cart, shopping-cart, baggage-cart, cargo-bike, delivery-van, truck and aircraft. People, robots and pushed carts turn in place at sharp corners. Steered vehicles never pivot: they slow down for corners and drive them as arcs. These are visual defaults, not vehicle specifications; spread one into your graph and override any field.'], headers: ['MotionProfile field', 'Type', 'Meaning'], rows: [
      ['acceleration', 'm/s² (0–50]', 'Start, stop and lane speed changes follow a trapezoidal speed profile.'],
      ['turnRate', 'rad/s (0–50]', 'Turn in place while standing: before leaving, toward a stop heading, at sharp corners and toward endYaw.'],
      ['turnInPlaceAngle', 'radians [0, π]', 'Corners sharper than this stop the agent. Default π/4 with turnRate, otherwise π (never).'],
      ['cornerSpeed', 'm/s', 'Speed through a 90° corner taken while moving; shallower corners interpolate toward full speed. Requires acceleration.'],
      ['cornerRadius', 'm (0–50]', 'Corners taken while moving become circular arcs tangent to both segments, using at most half of each. Timing stays on the polyline, so routeDuration and arrival times do not change. Corners where the agent turns in place stay sharp.'],
    ], code: `import { createNavGraph } from '@opsorama/core';
import { assetMotionProfiles } from '@opsorama/renderer-three';

const floor = createNavGraph({
  points, edges, lanes,
  agents: {
    person: assetMotionProfiles.worker,                       // brakes, turns in place
    vehicle: { ...assetMotionProfiles.forklift, speed: 2 },   // slows down, drives 1.2 m arcs
  },
});`, language: 'typescript' },
    { id: 'replacement', title: 'Replacement, pause and reduced motion', paragraphs: ['Re-sending an identical route keeps its progress, so duplicate updates are harmless. A different route uses the join policy: the agent continues along its current route to the first upcoming point that the new route also contains, then follows the new route, keeping its current heading and speed. When you plan from the previous destination the routes always share a point, so agents never jump or leave permitted lanes. Routes without a shared point are bridged directly, and that bridge is not rule-checked. joinRoutes builds the joined route and routeJoin returns the same composition as indices, so a simulation can plan exactly what the renderer shows.', 'Routes advance on the shared visual clock and follow scene speed and pause. Motion-off and reduced motion take precedence over pause and show the confirmed end of a one-way route, or hold a loop at its current pose. Re-enabling motion does not jump by elapsed wall-clock time.'] },
    { id: 'slots', title: 'Interaction slots', paragraphs: ['A slot is a place where one agent interacts with an object: an approach point where routes arrive, the interaction position, a heading and a pose hint (a worker variant such as working or seated). Slots in a group express capacity: a shelf has two pick faces, a desk pod one seat per desk. assetInteractionSlots in @opsorama/renderer-three declares slots for shelf, station, parcel-locker, whiteboard, desk-pod, meeting-table, bench and focus-pod.', 'resolveSceneSlots(nodes, assetInteractionSlots, { lift? }) turns them into world space using each node position, rotation and scale. Slot IDs are nodeId:slotName and double as movement-graph point IDs: add slotNavPoints(slots) to the graph and connect the approaches with edges. For fixed loops, toNodeRoute stops can visit a slot ({ waypoint, seconds, slot }).'], code: `import { resolveSceneSlots, slotNavPoints, createNavGraph } from '@opsorama/core';
import { assetInteractionSlots } from '@opsorama/renderer-three';

const slots = resolveSceneSlots(fixtures, assetInteractionSlots, { lift: 0.1 });
const graph = createNavGraph({
  points: [...walkwayPoints, ...slotNavPoints(slots)],
  edges: [{ from: 'aisle', to: 'packing-desk:work', lane: 'walkway' }, ...],
  agents: { person: { speed: 1.3 } },
});`, language: 'typescript' },
    { id: 'behaviors', title: 'Behaviors, reservations and queues', paragraphs: ['createBehaviorRunner({ graph, slots, agents, seed }) runs move, interact and wait steps per agent. interact reserves a free matching slot (by name or group), walks there, takes the slot pose and heading for the duration, then releases it. When every matching slot is taken the agent queues first come, first served, standing at the step queue points; a freed slot goes to the longest-waiting agent. A newcomer still takes a free slot that no waiting agent could use, e.g. when those agents wait for one named slot. Places count per object and list of queue points, whatever slot or group each agent asked for, so two agents never share a queue point. An agent that cannot reach its queue point is blocked with the planning violations and leaves the queue. Durations can be [min, max] ranges drawn from the seeded generator.', 'Events are processed in time order with agent-ID tie-breaks, so results do not depend on how often you call advance. Routes come only from the movement graph; failures leave the agent blocked with typed violations. assign(id, steps) replaces an agent behavior after a host command and releases its slot and queue place. An agent that is travelling first finishes its current segment, exactly as the renderer joins: a new route that sets off at once continues from its current pose (joinRoutes), while a wait, or a wait for capacity, starts at the next route point. Route, holds and the arrived event therefore match the visuals. behaviorNode(state, base) maps each agent to an asset node for any adapter.', 'Advance the runner from your own frame loop, applying scene speed and pause, the renderer per-frame cap (0.05 s) and skipping hidden frames, so poses and routes stay in step with the visuals. Keep it running with motion off: confirmed positions and poses still update without travel.'], code: `const runner = createBehaviorRunner({ graph, slots, seed: 3, agents: [{
  id: 'alex', agent: 'person', start: 'aisle', loop: true,
  steps: [
    { kind: 'interact', node: 'shelf', group: 'pick', seconds: [2, 4] },
    { kind: 'interact', node: 'packing-desk', group: 'work', seconds: 3,
      queue: ['queue-1', 'queue-2'] },
  ],
}] });

runner.subscribe(() => runner.getAgents().forEach(state =>
  store.upsert(behaviorNode(state, { asset: 'worker', label: 'Alex' }))));
// Each frame: runner.advance(Math.min(0.05, seconds) * speed);`, language: 'typescript' },
    { id: 'goals', title: 'Goals instead of scripts', paragraphs: ['Tell an agent where to go and what to use; it plans a permitted route, picks the nearest free slot, queues and turns by itself. A move target is a point ID, { position } (the reachable point nearest to a world position) or { node, slot?, group? } (the nearest approach of an object slot, without reserving it). Targets resolve when the step starts, from the agent point or the last via point. interact reserves the nearest free matching slot by planning cost and accepts via and avoidLanes.', 'runner.command(id, { goTo?, interact?, via?, avoidLanes?, label?, then? }) assigns a goal; commandSteps(command) returns the equivalent steps. graph.reach(agent, from) returns planning costs to every reachable point. A command is a visual intent, not a confirmed business action.', 'runner.subscribeEvents(listener) delivers typed events after each advance, assign or command, in simulation-time order: step-started, arrived, queued, yielding, interaction-started, interaction-ended (interrupted after a host command), picked-up, put-down, blocked, deadlock, stalled and finished. Events raised while the runner is created are not delivered.'], code: `runner.command('alex', {
  interact: { node: 'break-bench', group: 'seat', seconds: 8 },
  via: ['walk-pack'],
  then: [{ kind: 'move', to: { position: [1.6, 0, 0.5] } }],
});

const stop = runner.subscribeEvents(event => {
  if (event.type === 'interaction-ended') log(event.agent, event.slot, event.time);
  if (event.type === 'blocked') showViolations(event.violations);
});`, language: 'typescript' },
    { id: 'capacity', title: 'Capacity and yielding', paragraphs: ['Give a narrow place a capacity and behavior agents stop walking through each other there. NavEdge.capacity limits the agents between the end points of an edge, in either direction; NavLaneRule.capacity is the default for edges in that lane. NavPoint.capacity limits the agents standing at a point, walking between it and its slot or using that slot, and passing through it: a passing agent holds the point from leaving the previous point until reaching the next one. Points without a capacity are open junctions where agents may pass each other.', 'When an agent plans a trip, the runner turns the route into time windows on every limited point and edge, using routeTimes(route). If one is busy, the agent waits where it stands (phase yielding, or queued for a queue move) and sets off at the earliest moment everything fits, or it takes a detour when that arrives sooner. Windows are claimed in request order, so access is first come, first served. When someone stands in the way with no departure planned, the wait is open-ended; such waits are retried in request order whenever another agent sets off. The yielding event names the point, the agents in the way and, when known, the seconds. Waits are runner events, so the visuals and the simulation stay in step for any tick size.', 'Leave passing places: two agents that must swap two limited points wait for each other forever. The runner detects such a cycle: each member gets AgentState.deadlock (the agents in the cycle) and one deadlock event, and keeps waiting until a host command to any of them breaks the cycle. A wait that leads, directly or through other waiting agents, to an agent that stands still with nothing planned (finished, idle or blocked) cannot end either: the waiting agent gets AgentState.stalled (those agents) and one stalled event, and waits until the host moves one of them. A seated agent holds a limited approach, so do not limit approaches that others pass through to reach further slots.', 'runner.getHolds() lists current and planned holds ({ agent, point | edge, from, to }); pass them to navGraphOverlay with time: runner.time to see which limited points and edges are held now.'], code: `const floor = createNavGraph({
  points: [...walkwayPoints, ...slotNavPoints(slots).map(point => ({ ...point, capacity: 1 })),
    { id: 'queue-1', position: [1.6, 0.1, -2.85], capacity: 1 }],
  edges: [
    { from: 'aisle', to: 'packing-desk:work', lane: 'walkway', capacity: 1 }, // one person at a time
    ...walkwayEdges,
  ],
  agents: { person: assetMotionProfiles.worker },
});

runner.subscribeEvents(event => {
  if (event.type === 'yielding') log(event.agent, 'gives way to', event.agents, event.seconds);
});`, language: 'typescript' },
    { id: 'overlay', title: 'Debug overlay', paragraphs: ['navGraphOverlay(graph, { slots, reservations, routes, laneColors, holds, time }) describes edges (lane colors, one-way arrows), points, free and reserved slots and active routes. Capacity-limited points get a ring and limited edges a midpoint marker; the ones held at time turn orange, and held edges are traced. renderer.setOverlay(overlay) draws it above the scene without depth testing; setOverlay(null) removes it, and dispose releases it. Overlays are not selectable and are not part of the scene store. In React and Vue, reach the renderer through onReady / @ready.'] },
    { id: 'carry', title: 'Carrying items', paragraphs: ['Items are host-owned scene nodes such as parcels, totes or pallets. The behavior runner tracks only their placement: held by an agent at an anchor, resting on an object (at a named anchor or the object origin, plus an offset), or resting in the world. Give an agent a carry rule ({ anchor, capacity?, stackHeight?, travelPose?, idlePose? }) and add pickUp, putDown and putOn to its interact steps. Items change hands when the interaction ends: put-down first, then pick-up. pickUp takes item IDs or a number of items resting on the object, oldest first; putDown takes IDs or all; putOn names an anchor and offset on the object, otherwise items rest on the floor ahead of the slot. Items on one spot stack. An exchange that cannot happen blocks the agent with unknown-item, item-unavailable, carry-full or not-carrying and changes nothing.', 'AgentState.carrying lists held items, and the picked-up and put-down events name the object and items. getItems(), placeItem(id, at) and removeItem(id) let the host read and change items; a holder lets go of an item the host moves. itemNode(id, placement, base) maps a placement onto an asset node with an attachment, so React, Vue and JavaScript render carried items with the same scene contract. Run host item rules, such as restocking or shipping, in the onItemEvent option: it runs at the event simulation time, so the result does not depend on tick size. The worker holding pose has the carrying arms without a built-in box and a carry anchor for the item.', 'For a visible hand-over, set handOverSeconds on the carry rule and give item nodes a transfer of the same length: items change hands that long before the interaction ends, and the renderer moves each item from where it was to its new holder along a short arc (AssetNode.transfer: { seconds 0.05–5, arc? 0–2 m }), finishing as the agent leaves. Speed and pause apply; motion-off and reduced motion skip the animation. With reach (metres), a pick-up by item ID only takes items on the object being used or resting within that distance of the slot; others block with item-out-of-reach.'], code: `const runner = createBehaviorRunner({ graph, slots,
  items: [{ id: 'order-1', at: { node: 'shelf', offset: [0, 1.09, 0.1] } }],
  agents: [{ id: 'alex', agent: 'person', start: 'aisle',
    carry: { anchor: 'carry', travelPose: 'holding', idlePose: 'holding' },
    steps: [
      { kind: 'interact', node: 'shelf', group: 'pick', seconds: 2, pose: 'picking', pickUp: 1 },
      { kind: 'interact', node: 'packing-desk', group: 'work', seconds: 3, pose: 'placing',
        putDown: 'all', putOn: { offset: [0, 1.23, 0.35] } },
    ] }],
  onItemEvent: (event, items) => { if (event.type === 'picked-up') items.placeItem(nextOrderId(), shelfSpot()); },
});

const nodes = [
  ...runner.getAgents().map(state => behaviorNode(state, { asset: 'worker' })),
  ...[...runner.getItems()].map(([id, at]) => itemNode(id, at, { asset: 'parcel', scale: [0.4, 0.4, 0.4] })),
];`, language: 'typescript' },
    { id: 'forks', title: 'Lift trucks: forks and reversing', paragraphs: ['AssetNode.forks positions the forks of forklift and reach-truck models: height in metres from the travel height, and on the reach truck the forward reach of the mast, within FORK_LIMITS. Optional moves ease through further poses on the visual clock; the last pose is the confirmed result that motion-off and reduced motion show. A load attached to the load anchor rises with the forks, so a truck can set a pallet down at the height of its place without the pallet leaving the forks early. The motion is host data: a truck never lifts by itself. Replace the motion with its final pose once the moves end, because a rebuilt model starts remaining moves again.', 'A pallet\'s fork pockets open on its short side, so CarryRule.turn: 90 holds it with the long side along the forks. Place it the same way on the floor and in a rack, turned to match the direction the truck arrives from, and it never turns at a hand-over.', 'BehaviorAgent.backOut drives a vehicle out of a slot in reverse along the approach, with its heading held, instead of turning around with its forks in a load. NodeRoute.reverseSegments expresses the same on any route.'], code: `{ id: 'reach', kind: 'asset', asset: 'reach-truck', variant: 'operated',
  forks: { height: 0, moves: [
    { height: 1.45, seconds: 1.5 },
    { height: 1.45, reach: 1, seconds: 1 },
    { height: 1.33, reach: 1, seconds: .25 },
  ] } }`, language: 'typescript' },
    { id: 'carry-handling', title: 'Carrying with compatibility checks', paragraphs: ['Vehicles reach further than people, so putOn also takes a floor placement, { position, yaw } in world metres and radians, in both runner modes: a forklift sets a pallet down at the tips of its forks instead of 0.45 m ahead of the slot.', 'Pass a shared HandlingState as the handling option and every pick-up and put-down becomes a checked move: a worker cannot lift a pallet or pull the bottom carton out of a load, and a blocked agent reports the same codes as any other move. Each agent with a carry rule must be registered, with a receptacle at the rule\'s anchor. putOn then names a receptacle of the object. Move, add and remove units through the state, also inside onItemEvent; placeItem and removeItem throw, and the items option is not used. A count pickUp takes the oldest units it can reach. See the handling guide at /docs/handling. Without the option, items stay plain placements with no check, for scenes without handling declarations.'], code: `const handling = createHandlingState({
  handling: assetHandling, profiles: handlingProfiles,
  instances: [
    { id: 'shelf', asset: 'shelf' }, { id: 'desk', asset: 'station' },
    { id: 'alex', asset: 'worker' }, { id: 'order-1', asset: 'parcel' },
  ],
});
handling.move([{ unit: 'order-1', to: { container: 'shelf', receptacle: 'level-1' } }]);

const runner = createBehaviorRunner({ graph, slots, handling, agents: [{
  id: 'alex', agent: 'person', start: 'aisle',
  carry: { anchor: 'carry', travelPose: 'holding', idlePose: 'holding' },
  steps: [
    { kind: 'interact', node: 'shelf', group: 'pick', seconds: 2, pickUp: 1 },
    { kind: 'interact', node: 'desk', group: 'work', seconds: 3,
      putDown: 'all', putOn: { receptacle: 'surface' } },
  ],
}] });`, language: 'typescript' },
    { id: 'controllers', title: 'Motion controllers', paragraphs: ['A controller drives one asset node frame by frame with its own logic, instead of the default interpolation or a route. Name it in the node data: controller: { kind, options }. Options are JSON data, so scene definitions stay serializable. The renderer resolves the kind in basicControllers plus the controllers you pass to createSceneRenderer, or to SceneCanvas in React and Vue. A node cannot have both a route and a controller.', 'Built-ins: approach drives to the node record position with speed, acceleration, turnRate and optional arriveYaw: record, so a host only sets where a machine should be. follow trails another node (target, distance) and matches its speed. Neither checks movement rules or avoids obstacles.', 'A ControllerFactory(options, node) returns { update, settle?, cancel? }. update(frame, pose, context) runs on animated, unpaused visual frames with frame.delta already scaled by scene speed. It returns { position, yaw, moving? } in the node parent space; moving reaches the model animator, so a worker walks in place. context.node is the latest node and context.pose(id) is another node live pose. settle runs while motion is off or reduced and should return the confirmed pose. cancel(reason) runs once with cleared, replaced, removed, disposed or error. A controller that throws is stopped, reported through onError and not retried until its spec changes. Controllers are visual: they are not part of the deterministic behavior runner.'], code: `import type { ControllerFactory } from '@opsorama/core';

// Drive back and forth between two points; a pure function of its own clock.
const shuttle: ControllerFactory = options => {
  const from = options.from as [number, number, number], to = options.to as [number, number, number];
  const seconds = Math.hypot(to[0] - from[0], to[2] - from[2]) / Number(options.speed ?? 0.8);
  let clock = 0;
  const at = (time: number) => {
    const t = (time % (2 * seconds)) / seconds, back = t > 1, k = back ? 2 - t : t;
    return { position: [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[2] - from[2]) * k] as const,
      yaw: Math.atan2(to[0] - from[0], to[2] - from[2]) + (back ? Math.PI : 0), moving: true };
  };
  return { update: ({ delta }) => at(clock += delta), settle: () => ({ ...at(clock), moving: false }) };
};

<SceneCanvas controllers={{ shuttle }}>
  <Asset id="robot" asset="mobile-robot" position={[0, 0, 0]}
    controller={{ kind: 'shuttle', options: { from: [0, 0, 0], to: [4, 0, 0] } }} />
  <Asset id="cart" asset="picking-cart" position={[0, 0, -1]}
    controller={{ kind: 'follow', options: { target: 'robot', distance: 1.2 } }} />
</SceneCanvas>`, language: 'tsx' },
    { id: 'limits', title: 'Current limits', list: ['Agents give way only at points and edges with a capacity; they may pass close to each other at open junctions and on wide walkways. A detected deadlock or stalled wait is reported, not resolved: the host reassigns one of the agents.', 'Rounded corners are a visual path shape: an agent covers the arc in the time of the polyline legs, so it looks a little slower there. A replacement that joins a loop stops at the loop entry.', 'Item hand-overs are animated only for nodes with a transfer, and only when their attachment or parent changes. Pick-up reach is horizontal distance from the slot; items on other objects are always out of reach.', 'No navigation mesh, crowd steering or physics. Motion controllers ignore movement-graph rules and do not avoid each other, and start again from the record position after a remount.', 'Route progress survives a remount only when the host passes it in NodeRoute.elapsed, for example through behaviorNode(state, base, { time }).', 'A replacement joins the planned route at the first shared point and skips the part of it before that point, including a via point there. Plans from the next route point, as the behavior runner makes them, make this rare.'] },
    { id: 'examples', title: 'Runnable examples', paragraphs: ['Run /examples/motion to mount the same scripted shift through React, native Vue and plain JavaScript: three pickers share two pick faces, give way on one-person spurs and queue for one packing desk, an office worker alternates between a desk and a bench, pickers carry order parcels from the shelf to the packing bench while the host restocks and ships them, you can send a picker on a break with a goal command or back to work, send a delivery robot to another spot by changing only its position while a cart follows it and a host-defined shuttle controller runs a second robot, follow the typed event log, toggle motion, pause, speed and the movement-graph overlay, and see a route over the vehicle lane rejected. Source: examples/motion-data.ts, examples/motion-react.tsx, examples/motion-vue.ts and examples/motion-javascript.ts. The e-commerce picker at /examples/ecommerce walks a planned walkway loop that visits real shelf pick-face slots.'] },
  ],
};
