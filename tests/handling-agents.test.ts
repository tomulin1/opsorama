import { describe, expect, it, vi } from 'vitest';
import { createBehaviorRunner, createHandlingState, createNavGraph, itemNode, resolveSceneSlots, slotNavPoints, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorStep, type InteractionSlotSource } from '@opsorama/core';
import { assetHandling, assetInteractionSlots, handlingProfiles } from '@opsorama/renderer-three';
import { createShift, PACKED_ON_BENCH } from '../apps/site/examples/motion-data';

const objects: AssetNode[] = [
  { id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] },
  { id: 'desk', kind: 'asset', asset: 'station', position: [6, 0, -2] },
  { id: 'pallet', kind: 'asset', asset: 'pallet', position: [6, 0, 3] },
];
// The catalog pallet has no agent slot of its own; this scene adds one beside it.
const palletSlot: InteractionSlotSource = () => [{ name: 'side', pose: 'working', yaw: 0, position: [0, 0, -1], approach: [0, 0, -1.5] }];
const slots = resolveSceneSlots(objects, { ...assetInteractionSlots, pallet: palletSlot });
const graph = createNavGraph({
  points: [{ id: 'aisle', position: [0, 0, 0] }, { id: 'desk-aisle', position: [6, 0, 0] }, ...slotNavPoints(slots)],
  edges: [{ from: 'aisle', to: 'shelf:pick-0' }, { from: 'aisle', to: 'shelf:pick-1' }, { from: 'aisle', to: 'desk-aisle' }, { from: 'desk-aisle', to: 'desk:work' }, { from: 'desk-aisle', to: 'pallet:side' }],
  agents: { person: { speed: 1 } },
});
const carry = { anchor: 'carry', capacity: 2, travelPose: 'holding', idlePose: 'holding' };
const units = (count: number, asset = 'parcel', prefix = 'c') => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, asset }));
const setup = (extra: readonly { id: string; asset: string }[] = units(8)) => createHandlingState({
  handling: assetHandling, profiles: handlingProfiles,
  instances: [{ id: 'shelf', asset: 'shelf' }, { id: 'desk', asset: 'station' }, { id: 'pallet', asset: 'pallet' }, { id: 'a', asset: 'worker' }, { id: 'b', asset: 'worker' }, ...extra],
});
const shelfSpot = { container: 'shelf', receptacle: 'level-1' };
const picker = (steps: readonly BehaviorStep[], extra: Partial<BehaviorAgent> = {}): BehaviorAgent => ({ id: 'a', agent: 'person', start: 'aisle', carry, steps, ...extra });
const pick = (pickUp: number | readonly string[]): BehaviorStep => ({ kind: 'interact', node: 'shelf', slot: 'pick-0', seconds: 1, pickUp });
const palletPick = (pickUp: number | readonly string[]): BehaviorStep => ({ kind: 'interact', node: 'pallet', slot: 'side', seconds: 1, pickUp });
const pack: BehaviorStep = { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { receptacle: 'surface' } };
const runnerFor = (handling: ReturnType<typeof setup>, steps: readonly BehaviorStep[], extra: Partial<Parameters<typeof createBehaviorRunner>[0]> = {}, agent: Partial<BehaviorAgent> = {}) => createBehaviorRunner({ graph, slots, handling, agents: [picker(steps, agent)], ...extra });
const load = (handling: ReturnType<typeof setup>, ...ids: string[]) => expect(handling.move(ids.map(unit => ({ unit, to: shelfSpot }))).every(check => check.ok)).toBe(true);

describe('agents with handling state (H2)', () => {
  it('moves units through the shared state and mirrors them as items', () => {
    const handling = setup(); load(handling, 'c0', 'c1');
    const runner = runnerFor(handling, [pick(1), pack]);
    expect(runner.getItems().get('c0')).toEqual({ node: 'shelf', anchor: 'slot-4', offset: [0, 0, 0] });
    runner.advance(4);
    expect(runner.getAgent('a')).toMatchObject({ carrying: ['c0'], pose: 'holding' });
    expect(handling.placement('c0')).toMatchObject({ container: 'a', receptacle: 'carry', position: 0 });
    expect(runner.getItems().get('c0')).toEqual({ holder: 'a', anchor: 'carry', offset: [0, 0, 0] });
    runner.advance(30);
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    expect(handling.placement('c0')).toMatchObject({ container: 'desk', receptacle: 'surface', anchor: 'surface' });
    expect(handling.path('c0')).toEqual(['c0', 'desk']);
    runner.dispose();
  });

  it('piles units by their real height and drops on the floor without putOn', () => {
    const handling = setup(); load(handling, 'c0', 'c1');
    const runner = runnerFor(handling, [pick(2), { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all' }]);
    runner.advance(4);
    const held = runner.getAgent('a')!.carrying!;
    expect(held).toEqual(['c0', 'c1']);
    expect((runner.getItems().get('c1') as { offset: readonly number[] }).offset[1]).toBeCloseTo(.33);
    runner.advance(30);
    for (const id of held) expect(runner.getItems().get(id)).toHaveProperty('position');
    runner.dispose();
  });

  it('a put-down leaves the top of the stack first, so a whole stack can go down', () => {
    const handling = setup(); load(handling, 'c0', 'c1');
    const runner = runnerFor(handling, [pick(2), pack]);
    runner.advance(40);
    expect(runner.getAgent('a')?.phase).not.toBe('blocked');
    expect(handling.contents('desk')).toEqual(['c1', 'c0']);
    runner.dispose();
  });

  it('blocks incompatible exchanges with the handling codes and changes nothing', () => {
    const handling = setup([...units(2), { id: 'p2', asset: 'pallet' }]);
    handling.move([{ unit: 'c0', to: shelfSpot }, { unit: 'p2', to: { position: [0, 0, -1], yaw: 0 } }]);
    const events: BehaviorEvent[] = [], heavy = runnerFor(handling, [pick(['p2'])]);
    heavy.subscribeEvents(event => events.push(event));
    heavy.advance(4);
    expect(heavy.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'class-not-accepted' }] });
    expect(heavy.getAgent('a')?.violations?.[0].message).toContain('not logistics/industrial-pallet');
    expect(events.some(event => event.type === 'picked-up')).toBe(false);
    expect(handling.placement('p2')).toMatchObject({ position: [0, 0, -1] });
    heavy.dispose();
    const bad = runnerFor(handling, [pick(['c0']), { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { receptacle: 'attic' } }]);
    bad.advance(30);
    expect(bad.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'unknown-target' }] });
    expect(handling.placement('c0')).toMatchObject({ container: 'a' });
    bad.dispose();
  });

  it('an atomic exchange keeps the load when its pick-up fails', () => {
    const handling = setup(); load(handling, 'c0');
    handling.move([{ unit: 'c1', to: { container: 'desk', receptacle: 'surface' } }, { unit: 'c2', to: { container: 'desk', receptacle: 'surface' } }]);
    const runner = runnerFor(handling, [pick(['c0']), { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { receptacle: 'surface' }, pickUp: ['c1'] }]);
    runner.advance(30);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'not-accessible' }], carrying: ['c0'] });
    expect(handling.contents('desk')).toEqual(['c1', 'c2']);
    expect(handling.placement('c0')).toMatchObject({ container: 'a' });
    runner.dispose();
  });

  it('sets a load down at a floor placement instead of ahead of the slot', () => {
    const handling = setup(); load(handling, 'c0');
    const spot = { position: [7.5, 0, 1] as const, yaw: .5 };
    const runner = runnerFor(handling, [pick(1), { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: spot }]);
    runner.advance(30);
    expect(handling.placement('c0')).toEqual(spot);
    expect(runner.getItems().get('c0')).toEqual(spot);
    runner.dispose();
    expect(() => runnerFor(setup(), [{ kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { position: [0, 0, 0], yaw: Number.NaN } }])).toThrow('finite heading');
  });

  it('holds units at the quarter turn of the carry rule', () => {
    const handling = setup(); load(handling, 'c0');
    const runner = runnerFor(handling, [pick(1)], {}, { carry: { ...carry, turn: 90 } });
    runner.advance(4);
    expect(handling.placement('c0')).toMatchObject({ container: 'a', turn: 90 });
    expect(runner.getItems().get('c0')).toMatchObject({ holder: 'a', yaw: Math.PI / 2 });
    runner.dispose();
    expect(() => runnerFor(setup(), [pick(1)], {}, { carry: { ...carry, turn: 45 as 90 } })).toThrow('turn must be 0 or 90');
  });

  it('respects top-only access: IDs block, counts take what can be reached', () => {
    const handling = setup(units(9));
    expect(handling.move(Array.from({ length: 7 }, (_, i) => ({ unit: `c${i}`, to: { container: 'pallet', receptacle: 'deck' } }))).every(check => check.ok)).toBe(true);
    const blocked = runnerFor(handling, [palletPick(['c0'])]);
    blocked.advance(20);
    expect(blocked.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'not-accessible' }] });
    blocked.dispose();
    const counted = runnerFor(handling, [palletPick(1)]);
    counted.advance(20);
    expect(counted.getAgent('a')).toMatchObject({ carrying: ['c6'] });
    counted.dispose();
  });

  it('the receptacle capacity applies on top of the carry rule', () => {
    const handling = setup(); load(handling, 'c0', 'c1', 'c2');
    const named = runnerFor(handling, [pick(['c0', 'c1', 'c2'])], {}, { carry: { ...carry, capacity: 3 } });
    named.advance(4);
    expect(named.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'receptacle-full' }] });
    expect(handling.contents('a')).toEqual([]);
    named.dispose();
    const counted = runnerFor(handling, [pick(3)], {}, { carry: { ...carry, capacity: 3 } });
    counted.advance(4);
    expect(counted.getAgent('a')?.carrying).toEqual(['c0', 'c1']);
    counted.dispose();
    const rule = runnerFor(handling, [pick(['c2'])], {}, { carry: { ...carry, capacity: 1 } });
    rule.advance(4);
    expect(rule.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'carry-full' }] });
    rule.dispose();
  });

  it('keeps the runner checks for held and distant units', () => {
    const handling = setup(); load(handling, 'c0');
    handling.move([{ unit: 'c1', to: { container: 'b', receptacle: 'carry' } }, { unit: 'c2', to: { position: [9, 0, 9], yaw: 0 } }]);
    const unavailable = createBehaviorRunner({ graph, slots, handling, agents: [picker([pick(['c1'])]), { id: 'b', agent: 'person', start: 'desk-aisle', carry, steps: [] }] });
    unavailable.advance(4);
    expect(unavailable.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'item-unavailable' }] });
    expect(unavailable.getAgent('b')?.carrying).toEqual(['c1']);
    unavailable.dispose();
    const far = runnerFor(handling, [pick(['c2'])], {}, { carry: { ...carry, reach: 1 } });
    far.advance(4);
    expect(far.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'item-out-of-reach' }] });
    far.dispose();
    const unknown = runnerFor(handling, [pick(['ghost'])]);
    unknown.advance(4);
    expect(unknown.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'unknown-item' }] });
    unknown.dispose();
    const missing = runnerFor(handling, [{ kind: 'interact', node: 'desk', seconds: 1, putDown: ['c0'] }]);
    missing.advance(20);
    expect(missing.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'not-carrying' }] });
    missing.dispose();
  });

  it('host moves and removals show at once, also on what an agent holds', () => {
    const handling = setup(); load(handling, 'c0', 'c1');
    const runner = runnerFor(handling, [pick(2)]), listener = vi.fn();
    runner.advance(4);
    expect(runner.getAgent('a')?.carrying).toEqual(['c0', 'c1']);
    runner.subscribe(listener);
    handling.move([{ unit: 'c1', to: { container: 'desk', receptacle: 'surface' } }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runner.getAgent('a')?.carrying).toEqual(['c0']);
    expect(runner.getItems().get('c1')).toMatchObject({ node: 'desk', anchor: 'surface' });
    handling.unregister('c0');
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    expect(runner.getItems().has('c0')).toBe(false);
    runner.dispose();
    handling.move([{ unit: 'c2', to: shelfSpot }]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('host rules run inside the tick and the result does not depend on tick size', () => {
    const run = (tick: number) => {
      const handling = setup(units(40)), onShelf = () => [...handling.placements().values()].filter(at => 'container' in at && at.container === 'shelf').length;
      let next = 3; load(handling, 'c0', 'c1', 'c2');
      const log: string[] = [];
      const runner = createBehaviorRunner({ graph, slots, handling, seed: 7, agents: [picker([pick(1), pack], { loop: true }), { id: 'b', agent: 'person', start: 'desk-aisle', carry, steps: [{ kind: 'interact', node: 'desk', seconds: [1, 3], pickUp: 1 }, { kind: 'interact', node: 'desk', seconds: 1, putDown: 'all' }], loop: true }],
        onItemEvent: (event, items) => {
          log.push(`${items.time.toFixed(4)} ${event.type} ${event.items.join()}`);
          if (event.type === 'picked-up' && event.node === 'shelf' && onShelf() < 3) handling.move([{ unit: `c${next++}`, to: shelfSpot }]);
        } });
      for (let time = 0; time < 60; time += tick) runner.advance(tick);
      const items = [...runner.getItems()].map(([id, at]) => `${id}:${JSON.stringify(at)}`).sort();
      runner.dispose();
      return { log, items };
    };
    const coarse = run(.5);
    expect(coarse.log.length).toBeGreaterThan(8);
    expect(run(1 / 60)).toEqual(coarse);
  });

  it('turned units keep their heading on the way to a scene node', () => {
    const handling = setup(); load(handling, 'c0');
    const runner = runnerFor(handling, [pick(['c0']), { kind: 'interact', node: 'pallet', slot: 'side', seconds: 1, putDown: 'all', putOn: { receptacle: 'deck' } }]);
    runner.advance(30);
    const at = runner.getItems().get('c0')!;
    expect(at).toMatchObject({ node: 'pallet', anchor: 'load', yaw: Math.PI / 2 });
    expect(itemNode('c0', at, { asset: 'parcel' }).rotation).toEqual([0, Math.PI / 2, 0]);
    expect(itemNode('c1', { node: 'pallet', offset: [0, 0, 0] }, { asset: 'parcel' })).not.toHaveProperty('rotation');
    runner.dispose();
  });

  it('explains wrong setups before the shift starts', () => {
    const handling = setup();
    expect(() => runnerFor(handling, [], { items: [{ id: 'x', at: { position: [0, 0, 0] } }] })).toThrow(/place units with handling\.move/);
    expect(() => createBehaviorRunner({ graph, slots, handling, agents: [picker([], { id: 'nobody' })] })).toThrow(/no receptacle at anchor carry/);
    expect(() => runnerFor(handling, [], {}, { carry: { ...carry, anchor: 'hand' } })).toThrow(/no receptacle at anchor hand/);
    expect(() => runnerFor(handling, [{ kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { anchor: 'surface' } }])).toThrow(/putOn needs a receptacle of desk/);
    expect(() => createBehaviorRunner({ graph, slots, agents: [picker([{ kind: 'interact', node: 'desk', seconds: 1, putDown: 'all', putOn: { receptacle: 'surface' } }])] })).toThrow(/needs the runner's handling state/);
    const runner = runnerFor(handling, []);
    expect(() => runner.placeItem('c0', { position: [0, 0, 0] })).toThrow(/handling\.move/);
    expect(() => runner.removeItem('c0')).toThrow(/handling\.unregister/);
    runner.dispose();
  });

  it('the motion example runs on handling state with piles on the bench', () => {
    const shift = createShift(3);
    expect([...shift.getItems().keys()]).toEqual(['order-1', 'order-2', 'order-3']);
    expect(shift.getItems().get('order-2')).toEqual({ node: 'shelf-unit', anchor: 'slot-5', offset: [0, 0, 0] });
    for (let time = 0; time < 200; time += .25) {
      shift.advance(.25);
      for (const agent of shift.getAgents()) expect(agent.phase, agent.id).not.toBe('blocked');
      const resting = [...shift.getItems().values()].filter(at => 'node' in at);
      expect(resting.filter(at => 'node' in at && at.node === 'shelf-unit')).toHaveLength(3);
      expect(resting.filter(at => 'node' in at && at.node === 'packing-desk').length).toBeLessThanOrEqual(PACKED_ON_BENCH);
    }
    expect(shift.getItems().has('order-1')).toBe(false);
    shift.dispose();
  });
});
