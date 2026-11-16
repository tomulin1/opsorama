import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isPersonAsset, routeDuration, routeTimes, sampleRoute, type AssetNode, type SceneNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CARRY_AHEAD, PICKUP_CAPACITY, SCENARIOS, SERVICE_PERIOD, STATIONS, TABLE_LAYOUT, TABLE_STATUS, applyRestaurantSnapshot, createRestaurantStore, isOccupied, restaurantMetrics, restaurantNodes, serviceLoop, stationTickets, type RestaurantScenario } from '../apps/site/src/features/restaurant/model';
import { HAND_OFF, WASH_SECONDS, actorPose, compileService, platesAt, positionAt, standingPoint, trackServicePhase, type PlateRest, type PlateState, type ServiceCycle, type ServicePlan } from '../apps/site/src/features/restaurant/service';

const asset = (nodes: readonly SceneNode[], id: string) => nodes.find(node => node.id === id) as AssetNode;
const scenarios = Object.keys(SCENARIOS) as RestaurantScenario[];

describe('restaurant dashboard model', () => {
  it('builds a valid store for every snapshot and replaces it without stale guests', () => {
    const store = createRestaurantStore('rush');
    for (const scenario of [...scenarios, 'rush'] as const) {
      applyRestaurantSnapshot(store, SCENARIOS[scenario]);
      const nodes = store.getSnapshot().nodes, guests = nodes.filter(node => node.id.startsWith('guest:'));
      const covers = SCENARIOS[scenario].tables.filter(isOccupied).reduce((sum, table) => sum + table.party, 0);
      expect(guests, scenario).toHaveLength(covers);
      for (const guest of guests) expect(nodes.some(node => node.id === guest.attachment?.nodeId), guest.id).toBe(true);
    }
    store.dispose();
  });

  it('keeps one table record per floor-plan table and maps statuses to table states without status markers', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = restaurantNodes(snapshot);
      expect(snapshot.tables.map(table => table.tableId).sort()).toEqual(TABLE_LAYOUT.map(table => table.id).sort());
      for (const session of snapshot.tables) {
        const node = asset(nodes, `table:${session.tableId}`), seats = TABLE_LAYOUT.find(table => table.id === session.tableId)!.seats;
        expect(node.state).toBe(TABLE_STATUS[session.status].state); expect(node.entityId).toBe(session.tableId);
        expect(node.count).toBe(session.status === 'free' ? 0 : Math.min(seats, session.party));
        expect(nodes.some(other => other.kind === 'asset' && other.asset === 'map-pin'), scenario).toBe(false);
      }
    }
  });

  it('summarizes metrics and ready orders from the same tickets the stations show', () => {
    const rush = SCENARIOS.rush, metrics = restaurantMetrics(rush);
    expect(metrics.late).toBe(1); expect(metrics.tickets).toBe(rush.tickets.length);
    expect(metrics.ready).toBe(stationTickets(rush, 'pass').length + stationTickets(rush, 'pickup').length);
    const nodes = restaurantNodes(rush);
    // The pass shows real plates of the service loop instead of its decorative count.
    expect(asset(nodes, 'station:pass').count).toBe(0);
    expect(asset(nodes, 'station:pickup').count).toBe(Math.min(PICKUP_CAPACITY, stationTickets(rush, 'pickup').length));
    expect(asset(nodes, 'station:grill').state).toBe('critical');
    expect(asset(nodes, 'equipment:cooler').state).toBe('warning');
    // Every open ticket belongs to exactly one station view.
    const shown = STATIONS.flatMap(station => stationTickets(rush, station.id).map(ticket => ticket.id));
    expect(shown.sort()).toEqual(rush.tickets.map(ticket => ticket.id).sort());
  });

  it('caps ready bags at the pickup shelf capacity while totals stay exact', () => {
    const many = { ...SCENARIOS.rush, tickets: Array.from({ length: 12 }, (_, i) => ({ id: `#9${i}`, channel: i % 2 ? 'takeout' as const : 'dine-in' as const, ...(i % 2 ? {} : { tableId: 'T1' }), station: 'grill' as const, status: 'ready' as const, items: ['Fries'], minutes: 5, target: 10 })) };
    const nodes = restaurantNodes(many);
    expect(asset(nodes, 'station:pickup').count).toBe(6); expect(PICKUP_CAPACITY).toBeGreaterThanOrEqual(6);
    expect(restaurantMetrics(many).ready).toBe(12);
  });

  it('walks servers, the courier and arriving guests along routes that clear the furniture', () => {
    // Standing obstacles: world boxes of every mesh below head height (umbrella canopies and pass gantries are walked under).
    const obstacles = (nodes: readonly SceneNode[]) => nodes.flatMap(node => {
      if (node.kind !== 'asset' || node.attachment || isPersonAsset(node.asset) || node.footprint) return [];
      // Surface labels need a DOM canvas and add no standing geometry.
      const object = catalogAssets[node.asset]({ ...node, surfaceLabel: undefined }), boxes: THREE.Box3[] = [];
      object.position.fromArray(node.position ?? [0, 0, 0]); object.rotation.set(...(node.rotation ?? [0, 0, 0])); object.scale.fromArray(node.scale ?? [1, 1, 1]); object.updateMatrixWorld(true);
      object.traverse(child => { if (!(child instanceof THREE.Mesh)) return; const box = new THREE.Box3().setFromObject(child); if (box.min.y < 1.2 && box.max.y > .15) boxes.push(box); });
      disposeObject(object);
      return boxes.map(box => ({ id: node.id, box }));
    });
    const RADIUS = .18;
    for (const scenario of scenarios) {
      const nodes = restaurantNodes(SCENARIOS[scenario]), solid = obstacles(nodes), walkers = nodes.filter((node): node is AssetNode => node.kind === 'asset' && !!node.route);
      expect(walkers.length, scenario).toBeGreaterThan(0);
      for (const walker of walkers) {
        const route = walker.route!, duration = routeDuration(route);
        expect(walker.position, walker.id).toEqual(route.points[0]);
        for (let t = 0; t <= duration; t += .05) {
          const { position: [x, , z] } = sampleRoute(route, t);
          const hit = solid.find(({ box }) => x > box.min.x - RADIUS && x < box.max.x + RADIUS && z > box.min.z - RADIUS && z < box.max.z + RADIUS);
          expect(hit?.id, `${scenario} ${walker.id} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeUndefined();
        }
      }
    }
  });

  const served = ['rush', 'quiet'] as const;
  const loopOf = (scenario: RestaurantScenario) => serviceLoop(SCENARIOS[scenario])!;
  const STEP = .1, phases = Array.from({ length: Math.round(SERVICE_PERIOD / STEP) }, (_, i) => i * STEP);
  /** World point of a plate rest, from the catalog model of the node it rests on. */
  const restPoint = (nodes: readonly SceneNode[], rest: PlateRest) => {
    const owner = asset(nodes, rest.node), model = catalogAssets[owner.asset]({ ...owner, surfaceLabel: undefined });
    model.position.fromArray(owner.position ?? [0, 0, 0]); model.rotation.set(...(owner.rotation ?? [0, 0, 0])); model.updateMatrixWorld(true);
    const point = (rest.anchor ? model.getObjectByName(`anchor-${rest.anchor}`)! : model).localToWorld(new THREE.Vector3(...rest.offset));
    disposeObject(model);
    return point;
  };
  /** Where a plate is, as a coarse stage of its trip. */
  const stage = (cycle: ServiceCycle, plate: PlateState, table: string) => plate.holder ? (cycle.actors.find(actor => actor.id === plate.holder)!.stops.some(stop => stop.pose === 'working') ? 'cook' : 'server')
    : plate.rest!.node.startsWith('station:') && plate.rest!.node !== 'station:pass' ? 'station' : plate.rest!.node === 'station:pass' ? 'pass' : plate.rest!.node === table ? `table ${plate.load}` : plate.rest!.node === 'equipment:dish' ? 'dish' : `elsewhere ${plate.rest!.node}`;

  it('loops exactly the snapshot\'s dine-in kitchen tickets, each served by its table\'s server', () => {
    expect(serviceLoop(SCENARIOS.closed)).toBeNull();
    // A snapshot the loop was not written for shows no loop instead of plates for other tickets.
    expect(serviceLoop({ ...SCENARIOS.rush })).toBeNull();
    for (const scenario of served) {
      const snapshot = SCENARIOS[scenario], { cycle } = loopOf(scenario);
      const dineIn = snapshot.tickets.filter(ticket => ticket.channel === 'dine-in' && ticket.station !== 'bar');
      expect(cycle.courses.map(({ course }) => course.id).sort(), scenario).toEqual(dineIn.map(ticket => ticket.id).sort());
      for (const { course, steps } of cycle.courses) {
        const ticket = dineIn.find(item => item.id === course.id)!, session = snapshot.tables.find(table => table.tableId === ticket.tableId)!;
        expect(course.table, course.id).toBe(`table:${ticket.tableId}`);
        // The cook of the ticket's station plates it there; the server of the ticket's table serves it.
        expect(course.plated.every(rest => rest.node === `station:${ticket.station}`), course.id).toBe(true);
        expect(course.plated.length, course.id).toBe(Math.min(2, session.party));
        const holders = steps.flatMap(step => 'holder' in step.place ? [step.place.holder] : []);
        expect(holders, course.id).toEqual([`staff:${scenario}:${ticket.station}`, `staff:${scenario}:${session.server!.toLowerCase()}`, `staff:${scenario}:${session.server!.toLowerCase()}`]);
      }
    }
  });

  it('times every walk to one loop and builds the scene nodes from it', () => {
    for (const scenario of served) {
      const { cycle } = loopOf(scenario), nodes = restaurantNodes(SCENARIOS[scenario], 37);
      for (const actor of cycle.actors) {
        expect(routeDuration(actor.route), actor.id).toBeCloseTo(SERVICE_PERIOD, 6);
        // Route time 0 is the arrival at the first stop; every stop is reached when the plan says.
        const times = routeTimes(actor.route);
        for (const { index, seconds } of actor.route.stops!) expect(times[index].depart - times[index].arrive, actor.id).toBeCloseTo(seconds, 6);
        for (const stop of actor.stops) for (const offset of [.05, (stop.leave - stop.arrive + SERVICE_PERIOD) % SERVICE_PERIOD - .05]) expect(positionAt(cycle, actor, stop.arrive + offset), actor.id).toEqual(stop.at);
        const node = asset(nodes, actor.id);
        expect(node.route!.elapsed, actor.id).toBeCloseTo(((37 - actor.start) % SERVICE_PERIOD + SERVICE_PERIOD) % SERVICE_PERIOD, 6);
        expect(node.variant, actor.id).toBe(actorPose(cycle, actor, 37));
      }
      expect(nodes.filter(node => node.id.startsWith('plate:')).map(node => node.id).sort()).toEqual(platesAt(cycle, 37).map(plate => plate.id).sort());
    }
  });

  it('starts the loop at the snapshot: ready tickets wait on the pass and the others are still in the kitchen', () => {
    for (const scenario of served) {
      const snapshot = SCENARIOS[scenario], plates = platesAt(loopOf(scenario).cycle, 0);
      for (const ticket of snapshot.tickets.filter(item => item.channel === 'dine-in' && item.station !== 'bar')) {
        const own = plates.filter(plate => plate.course === ticket.id);
        if (ticket.status === 'ready') expect(own.length && own.every(plate => plate.rest?.node === 'station:pass'), ticket.id).toBeTruthy();
        else expect(own.every(plate => plate.rest?.node === `station:${ticket.station}`), ticket.id).toBe(true);
      }
    }
  });

  it('moves each course once around the loop: station, cook, pass, server, its table, cleared to the dish machine', () => {
    for (const scenario of served) {
      const { cycle } = loopOf(scenario);
      for (const { course, washed } of cycle.courses) {
        const trip: string[] = [];
        for (let since = 0; since < SERVICE_PERIOD; since += STEP) {
          const plates = platesAt(cycle, course.platedAt + since).filter(plate => plate.course === course.id);
          const now = plates.length ? [...new Set(plates.map(plate => stage(cycle, plate, course.table)))].join('+') : 'gone';
          if (trip.at(-1) !== now) trip.push(now);
        }
        expect(trip, `${scenario} ${course.id}`).toEqual(['station', 'cook', 'pass', 'server', 'table full', 'table empty', 'server', 'dish', 'gone']);
        expect(washed, course.id).toBeLessThan(SERVICE_PERIOD);
      }
    }
  });

  it('never doubles plates: one plate per place, at most two in hand, only a table\'s own course on its settings', () => {
    for (const scenario of served) {
      const snapshot = SCENARIOS[scenario], { cycle } = loopOf(scenario);
      for (const phase of phases) {
        const plates = platesAt(cycle, phase), rests = plates.flatMap(plate => plate.rest ? [`${plate.rest.node} ${plate.rest.anchor} ${plate.rest.offset.join()}`] : []);
        expect(new Set(rests).size, `${scenario} ${phase.toFixed(1)}`).toBe(rests.length);
        for (const actor of cycle.actors) expect(plates.filter(plate => plate.holder === actor.id).length, actor.id).toBeLessThanOrEqual(2);
        for (const session of snapshot.tables) {
          const onTable = plates.filter(plate => plate.rest?.node === `table:${session.tableId}`);
          expect(new Set(onTable.map(plate => plate.course)).size, `${scenario} ${session.tableId} ${phase.toFixed(1)}`).toBeLessThanOrEqual(1);
          expect(onTable.length, session.tableId).toBeLessThanOrEqual(isOccupied(session) ? session.party : 0);
          for (const plate of onTable) expect(cycle.courses.find(({ course }) => course.id === plate.course)!.course.table).toBe(`table:${session.tableId}`);
        }
      }
    }
  });

  it('hands plates over within reach while the person stands at the place, in the pose of what it does', () => {
    for (const scenario of served) {
      const { cycle } = loopOf(scenario), nodes = restaurantNodes(SCENARIOS[scenario]);
      for (const actor of cycle.actors) for (const stop of actor.stops) {
        if (!stop.action) continue;
        const at = stop.leave - HAND_OFF, [x, z] = positionAt(cycle, actor, at), carry = [x + Math.sin(stop.yaw) * CARRY_AHEAD, z + Math.cos(stop.yaw) * CARRY_AHEAD];
        expect([x, z], actor.id).toEqual(stop.at);
        const course = 'take' in stop.action ? stop.action.take : stop.action.put;
        const rests = 'put' in stop.action ? stop.action.on : platesAt(cycle, at - .05).filter(plate => plate.course === course).map(plate => plate.rest!);
        for (const rest of rests) { const point = restPoint(nodes, rest); expect(Math.hypot(point.x - carry[0], point.z - carry[1]), `${actor.id} ${course} ${rest.node}`).toBeLessThan(1.45); }
        // Plates leave or reach the hands at the hand-over, so the pose changes there too.
        const holds = (phase: number) => platesAt(cycle, phase).some(plate => plate.holder === actor.id);
        expect(holds(at + .05), actor.id).toBe('take' in stop.action); expect(holds(at - .05), actor.id).toBe('put' in stop.action);
        expect(actorPose(cycle, actor, at + .05), actor.id).toBe('take' in stop.action ? 'holding' : stop.pose ?? 'walking');
      }
      for (const phase of phases) for (const actor of cycle.actors) if (!platesAt(cycle, phase).some(plate => plate.holder === actor.id)) {
        const stop = actor.stops.find(item => ((phase - item.arrive) % SERVICE_PERIOD + SERVICE_PERIOD) % SERVICE_PERIOD < ((item.leave - item.arrive) % SERVICE_PERIOD + SERVICE_PERIOD) % SERVICE_PERIOD);
        expect(actorPose(cycle, actor, phase), actor.id).toBe(stop?.pose ?? 'walking');
      }
    }
  });

  it('keeps the people of the loop out of each other\'s way and away from staff at their posts', () => {
    for (const scenario of served) {
      const { cycle } = loopOf(scenario), posts = restaurantNodes(SCENARIOS[scenario]).filter((node): node is AssetNode => node.kind === 'asset' && isPersonAsset(node.asset) && !node.route && !node.attachment);
      for (const phase of phases) {
        const people = [...cycle.actors.map(actor => ({ id: actor.id, at: positionAt(cycle, actor, phase) })), ...posts.map(node => ({ id: node.id, at: [node.position![0], node.position![2]] as const }))];
        for (let i = 0; i < cycle.actors.length; i++) for (let j = i + 1; j < people.length; j++) {
          expect(Math.hypot(people[i].at[0] - people[j].at[0], people[i].at[1] - people[j].at[1]), `${scenario} ${people[i].id} and ${people[j].id} at ${phase.toFixed(1)} s`).toBeGreaterThanOrEqual(.5);
        }
      }
    }
  });

  it('puts plates in hand on top of the hands and plates on a table on the guests\' place settings', () => {
    for (const scenario of served) {
      const { cycle } = loopOf(scenario), checked = new Set<string>();
      for (const phase of phases) for (const plate of platesAt(cycle, phase)) {
        const place = plate.holder ?? plate.rest!.node;
        if (!place.startsWith('staff:') && !place.startsWith('table:') || checked.has(`${place} ${plate.id}`)) continue;
        checked.add(`${place} ${plate.id}`);
        const nodes = restaurantNodes(SCENARIOS[scenario], phase), node = asset(nodes, plate.id), label = `${scenario} ${plate.id} at ${phase.toFixed(1)} s`;
        expect(node.asset).toBe('serving-plates'); expect(node.count).toBe(1); expect(node.transfer).toBeDefined(); expect(node.variant).toBe(plate.load);
        const owner = asset(nodes, node.attachment!.nodeId), holder = catalogAssets[owner.asset]({ ...owner, route: undefined }), model = catalogAssets['serving-plates'](node);
        holder.getObjectByName(`anchor-${node.attachment!.anchor}`)!.add(model); model.position.fromArray(node.position!); model.rotation.set(...(node.rotation ?? [0, 0, 0])); holder.updateMatrixWorld(true);
        const held = new THREE.Box3().setFromObject(model);
        if (plate.holder) {
          expect(owner.variant, label).toBe('holding');
          const hands = new THREE.Box3().setFromObject(holder.getObjectByName('anchor-hand')!.parent!);
          expect(held.min.y - hands.max.y, label).toBeGreaterThan(-.01); expect(held.min.y - hands.max.y, label).toBeLessThan(.03);
        } else {
          const settings: THREE.Box3[] = []; holder.traverse(child => { if (child.name === 'setting-plate') settings.push(new THREE.Box3().setFromObject(child)); });
          const center = held.getCenter(new THREE.Vector3()), under = settings.find(box => Math.hypot(box.getCenter(new THREE.Vector3()).x - center.x, box.getCenter(new THREE.Vector3()).z - center.z) < .02);
          expect(under, label).toBeDefined();
          expect(held.min.y - under!.max.y, label).toBeGreaterThanOrEqual(-.001); expect(held.min.y - under!.max.y, label).toBeLessThan(.01);
        }
        model.removeFromParent(); disposeObject(model); disposeObject(holder);
      }
      expect([...checked].some(key => key.startsWith('staff:')) && [...checked].some(key => key.startsWith('table:')), scenario).toBe(true);
    }
  });

  it('finds the loop phase again from where the renderer draws the people', () => {
    const { cycle } = loopOf('rush');
    for (const phase of [3, 41.7, 88.2, 120, 149.5]) {
      const observe = (id: string) => positionAt(cycle, cycle.actors.find(actor => actor.id === id)!, phase);
      // A matching estimate stands; a wrong one (a remount, a hidden tab) is replaced by a phase that fits everyone.
      expect(trackServicePhase(cycle, observe, phase)).toBe(phase);
      const found = trackServicePhase(cycle, observe, (phase + 60) % SERVICE_PERIOD);
      for (const actor of cycle.actors) expect(Math.hypot(...positionAt(cycle, actor, found).map((value, i) => value - observe(actor.id)[i]) as [number, number])).toBeLessThanOrEqual(.25);
      expect(trackServicePhase(cycle, () => null, 12)).toBe(12);
    }
    // The carry anchor's Euler angles give back where a person stands, whichever way it faces.
    for (const yaw of [0, .8, 2.6, -2.2, Math.PI]) {
      const rig = new THREE.Object3D(), anchor = new THREE.Object3D(); rig.position.set(2, 0, -3); rig.rotation.y = yaw; anchor.position.set(0, .84, CARRY_AHEAD); rig.add(anchor); rig.updateMatrixWorld(true);
      const euler = new THREE.Euler().setFromQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion())), point = anchor.getWorldPosition(new THREE.Vector3());
      const [x, z] = standingPoint({ position: point.toArray(), rotation: [euler.x, euler.y, euler.z] }, CARRY_AHEAD);
      expect(x, `yaw ${yaw}`).toBeCloseTo(2, 6); expect(z, `yaw ${yaw}`).toBeCloseTo(-3, 6);
    }
  });

  it('rejects service plans that cannot be walked or would move plates out of turn', () => {
    const rest = (node: string): PlateRest => ({ node, offset: [0, 0, 0] });
    const plan = (stops: ServicePlan['actors'][number]['stops'], plated = 10): ServicePlan => ({ period: 60, actors: [{ id: 'server', speed: 1, stops }], courses: [{ id: 'A', table: 'table:T1', platedAt: plated, plated: [rest('station:grill')] }] });
    const good = plan([
      { at: [0, 0], yaw: 0, leave: 20, action: { take: 'A' } },
      { at: [5, 0], yaw: 0, dwell: 3, action: { put: 'A', on: [rest('table:T1')] } },
      { at: [5, 1], yaw: 0, leave: 40, action: { take: 'A' } },
      { at: [0, 1], yaw: 0, dwell: 2, action: { put: 'A', on: [rest('equipment:dish')] } },
    ]);
    const { courses: [course] } = compileService(good);
    // The last put is one hand-off before leaving the dish stop (40 s + 5 m walk + 2 s), counted from plating at 10 s.
    expect(course.washed).toBeCloseTo(40 + 5 + 2 - HAND_OFF - 10 + WASH_SECONDS, 6);
    expect(() => compileService({ ...good, actors: [{ ...good.actors[0], stops: good.actors[0].stops.map((stop, i) => i === 2 ? { ...stop, leave: 29.5 } : stop) }] })).toThrow(/stops last at least/);
    expect(() => compileService({ ...good, actors: [{ ...good.actors[0], stops: good.actors[0].stops.slice(0, 2) }] })).toThrow(/needs a put on table:T1 and a later take/);
    expect(() => compileService({ ...good, actors: [{ ...good.actors[0], stops: good.actors[0].stops.map((stop, i) => i === 3 ? { ...stop, dwell: 40 } : stop) }] })).toThrow(/loop lasts/);
    expect(() => compileService(plan(good.actors[0].stops, 50))).toThrow(/without holding them|still holds them|still on the dish machine/);
  });

  it('shows a closed restaurant with idle stations, a cold oven and no guests', () => {
    const nodes = restaurantNodes(SCENARIOS.closed);
    for (const station of STATIONS) expect(asset(nodes, `station:${station.id}`).state, station.id).toBe('inactive');
    expect(nodes.some(node => node.id.startsWith('guest:') || node.id.startsWith('bar-guest:'))).toBe(false);
    const oven = catalogAssets['pizza-oven'](asset(nodes, 'station:pizza')); let fire = 0; oven.traverse(child => { if (child.name === 'oven-fire') fire++; }); expect(fire).toBe(0); disposeObject(oven);
    expect(restaurantMetrics(SCENARIOS.closed)).toMatchObject({ guests: 0, occupied: 0, tickets: 0 });
  });
});
