import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createHandlingState, createSceneStore, type AssetHandling, type AssetNode, type HandlingEvent, type HandlingProfile, type HandlingTarget, type HandlingViolationCode, type ReceptaclePlacement } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { assetHandling, catalogAssets, handlingProfiles, logisticsProfile } from '@opsorama/objects';

const instances = [
  ...['p1', 'p2'].map(id => ({ id, asset: 'pallet' })),
  ...Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, asset: 'parcel' })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, asset: 'tote' })),
  { id: 'shelf', asset: 'shelf' }, { id: 'rack', asset: 'pallet-rack' }, { id: 'jack', asset: 'pallet-jack' }, { id: 'worker', asset: 'worker' },
];
const create = (rule?: Parameters<typeof createHandlingState>[0]['rule']) => createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances, rule });
const codes = (check: { violations: readonly { code: HandlingViolationCode }[] }) => check.violations.map(entry => entry.code);
const deck = (container: string, extra: object = {}) => ({ container, receptacle: 'deck', ...extra });
/** Load `count` parcels onto a pallet; fails the test when a move fails. */
function loadCartons(state: ReturnType<typeof create>, pallet: string, from: number, count: number) {
  for (let i = from; i < from + count; i++) expect(codes(state.move([{ unit: `c${i}`, to: deck(pallet) }])[0]), `c${i}`).toEqual([]);
}

// A small vocabulary for rules the shared logistics classes do not exercise.
const testProfile: HandlingProfile = {
  id: 'test', name: 'Test',
  classes: [
    { id: 'test/fragile', family: 'case', name: 'Fragile', size: { footprint: [.5, .4], height: .3 }, stacking: { maxAbove: 0, families: [] }, turnable: false },
    { id: 'test/sturdy', family: 'case', name: 'Sturdy', size: { footprint: [.5, .4], height: .3 }, stacking: { maxAbove: 1, families: ['case'] }, turnable: true },
    { id: 'test/plank', family: 'case', name: 'Plank', size: { footprint: [.3, .3], height: .1 }, stacking: { maxAbove: 3, families: ['case'] }, turnable: true },
  ],
  patterns: [],
};
const testHandling: Readonly<Record<string, AssetHandling>> = {
  fragile: { unit: { class: 'test/fragile', scale: 1 }, receptacles: [] },
  sturdy: { unit: { class: 'test/sturdy', scale: 1 }, receptacles: [] },
  plank: { unit: { class: 'test/plank', scale: 1 }, receptacles: [] },
  bench: { receptacles: [{ name: 'top', arrangement: 'deck', anchor: 'top', patterns: [], accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }] },
  pile: { receptacles: [{ name: 'pile', arrangement: 'stack', anchor: 'pile', capacity: 4, accepts: { families: ['case'] }, envelope: { footprint: [.6, .5], height: .5 } }] },
  narrow: { receptacles: [{ name: 'gap', arrangement: 'slot', anchors: ['gap-0'], accepts: { families: ['case'] }, envelope: { footprint: [.42, .55], height: .5 } }] },
};
const testState = () => createHandlingState({
  handling: testHandling, profiles: [testProfile],
  instances: [...['f1', 'f2'].map(id => ({ id, asset: 'fragile' })), ...['s1', 's2', 's3'].map(id => ({ id, asset: 'sturdy' })), ...['k1'].map(id => ({ id, asset: 'plank' })), { id: 'bench', asset: 'bench' }, { id: 'pile', asset: 'pile' }, { id: 'narrow', asset: 'narrow' }],
});

describe('handling state (H1)', () => {
  it('resolves slots to the next free position and reports taken, full and unknown positions', () => {
    const state = create(), place = { container: 'shelf', receptacle: 'level-0' };
    expect(state.move([{ unit: 'c0', to: place }])[0]).toMatchObject({ ok: true, placement: { anchor: 'slot-0', position: 0, turn: 0, offset: [0, 0, 0] } });
    expect(state.check('c1', place).placement).toMatchObject({ anchor: 'slot-1', position: 1 });
    expect(state.check('c1', { ...place, position: 2 }).placement).toMatchObject({ anchor: 'slot-2' });
    expect(state.check('c1', { ...place, position: 0 }).violations[0]).toMatchObject({ code: 'position-taken', blocking: ['c0'] });
    expect(codes(state.check('c1', { ...place, position: 9 }))).toEqual(['unknown-target']);
    state.move([1, 2, 3].map(i => ({ unit: `c${i}`, to: place })));
    expect(codes(state.check('c4', place))).toEqual(['receptacle-full']);
    expect(state.contents('shelf')).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('checks families, classes and sizes, and turns a unit only when it has to and may', () => {
    const state = create(), stateB = testState();
    expect(codes(state.check('c0', { container: 'rack', receptacle: 'level-0' }))).toEqual(['class-not-accepted']);
    expect(codes(state.check('p1', { container: 'shelf', receptacle: 'level-0' }))).toEqual(['class-not-accepted']);
    expect(state.check('p1', { container: 'rack', receptacle: 'level-0' }).placement).toMatchObject({ anchor: 'slot-0', turn: 0, offset: [0, 0, -.55] });
    expect(state.check('p1', { container: 'rack', receptacle: 'level-0', turn: 90 }).placement).toMatchObject({ turn: 90 });
    // 0.5 m wide units do not fit a 0.42 m gap as they are; a sturdy one fits turned, a fragile one may not turn.
    expect(stateB.check('s1', { container: 'narrow', receptacle: 'gap' }).placement).toMatchObject({ turn: 90 });
    expect(codes(stateB.check('f1', { container: 'narrow', receptacle: 'gap' }))).toEqual(['does-not-fit']);
    expect(codes(stateB.check('f1', { container: 'narrow', receptacle: 'gap', turn: 90 }))).toEqual(['does-not-fit']);
    expect(codes(stateB.check('s1', { container: 'narrow', receptacle: 'gap', turn: 0 }))).toEqual(['does-not-fit']);
  });

  it('piles units level by level, respects capacity and only gives up the top one', () => {
    const state = create(), hands = { container: 'worker', receptacle: 'carry' };
    state.move([{ unit: 'c0', to: hands }, { unit: 't0', to: hands }]);
    expect(state.placement('c0')).toMatchObject({ anchor: 'carry', position: 0, offset: [0, 0, 0] });
    const second = state.placement('t0') as ReceptaclePlacement;
    expect(second.position).toBe(1); expect(second.offset[1]).toBeCloseTo(.33);
    expect(codes(state.check('c1', hands))).toEqual(['receptacle-full']);
    expect(state.check('c0', { position: [0, 0, 0], yaw: 0 }).violations[0]).toMatchObject({ code: 'not-accessible', blocking: ['t0'] });
    expect(state.move([{ unit: 't0', to: { position: [0, 0, 0], yaw: 0 } }, { unit: 'c0', to: { position: [1, 0, 0], yaw: 0 } }]).every(check => check.ok)).toBe(true);
    const pile = testState(), at = { container: 'pile', receptacle: 'pile' };
    pile.move([{ unit: 's1', to: at }]);
    expect(codes(pile.check('s2', { ...at, position: 0 }))).toEqual(['position-taken']);
    expect(codes(pile.check('s2', { ...at, position: 2 }))).toContain('no-support');
  });

  it('a pile keeps working when a host removes a unit from its middle', () => {
    const state = create(), hands = { container: 'desk', receptacle: 'surface' };
    state.register([{ id: 'desk', asset: 'station' }]);
    state.move([0, 1, 2].map(i => ({ unit: `c${i}`, to: hands })));
    state.unregister('c0');
    expect((state.placement('c1') as ReceptaclePlacement).offset[1]).toBeCloseTo(0);
    expect((state.placement('c2') as ReceptaclePlacement).offset[1]).toBeCloseTo(.33);
    expect(state.move([{ unit: 'c3', to: hands }])[0].placement).toMatchObject({ position: 3 });
    expect((state.placement('c3') as ReceptaclePlacement).offset[1]).toBeCloseTo(.66);
  });

  it('lists placements by arrival and finds the receptacle at an anchor', () => {
    const state = create();
    state.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-0' } }, { unit: 'c1', to: { container: 'shelf', receptacle: 'level-1' } }]);
    state.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-2' } }]);
    expect([...state.placements().keys()]).toEqual(['c1', 'c0']);
    // A failed batch leaves the arrival order as it was.
    state.move([{ unit: 'c1', to: { container: 'shelf', receptacle: 'level-0' } }, { unit: 'p1', to: { container: 'shelf', receptacle: 'level-0' } }]);
    expect([...state.placements().keys()]).toEqual(['c1', 'c0']);
    expect(state.receptacleAt('worker', 'carry')).toBe('carry');
    expect(state.receptacleAt('shelf', 'slot-5')).toBe('level-1');
    expect(state.receptacleAt('worker', 'hand')).toBeUndefined();
    expect(state.receptacleAt('ghost', 'carry')).toBeUndefined();
  });

  it('applies stacking rules in piles and on decks', () => {
    const state = testState(), at = { container: 'pile', receptacle: 'pile' };
    state.move([{ unit: 'f1', to: at }]);
    expect(state.check('s1', at).violations[0]).toMatchObject({ code: 'stack-limit', blocking: ['f1'] });
    state.move([{ unit: 'f1', to: { position: [0, 0, 0], yaw: 0 } }, { unit: 's1', to: at }, { unit: 's2', to: at }]);
    // Sturdy carries one unit above it, so the third level overloads the bottom one.
    expect(state.check('s3', at).violations[0]).toMatchObject({ code: 'stack-limit', blocking: ['s1'] });
    const top = { container: 'bench', receptacle: 'top' };
    expect(state.move([{ unit: 'f2', to: { ...top, free: [0, 0] } }])[0].ok).toBe(true);
    expect(state.check('k1', { ...top, layer: 1, free: [0, 0] }).violations[0]).toMatchObject({ code: 'stack-limit', blocking: ['f2'] });
  });

  it('builds a mixed pallet from exactly specified layers', () => {
    const state = create();
    loadCartons(state, 'p1', 0, 6);
    expect(state.placement('c0')).toMatchObject({ layer: 0, pattern: 'logistics/carton-m-3x2', position: 0, turn: 90 });
    expect(state.contents('p1')).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    // Totes do not share the carton pattern, so they start the next layer on top of the cartons.
    expect(state.move([{ unit: 't0', to: deck('p1') }])[0].ok).toBe(true);
    const tote = state.placement('t0') as ReceptaclePlacement;
    expect(tote).toMatchObject({ layer: 1, pattern: 'logistics/tote-2x2', position: 0, turn: 0 });
    expect(tote.offset[0]).toBeCloseTo(-.3); expect(tote.offset[1]).toBeCloseTo(.33); expect(tote.offset[2]).toBeCloseTo(-.2);
    state.move([1, 2, 3].map(i => ({ unit: `t${i}`, to: deck('p1') })));
    // A free unit on the next layer rests on the tallest units below: 0.33 + 0.28 m.
    expect(state.move([{ unit: 'c6', to: deck('p1', { layer: 2, free: [.1, .1], turn: 90 }) }])[0].ok).toBe(true);
    expect((state.placement('c6') as ReceptaclePlacement).offset[1]).toBeCloseTo(.61);
    expect(state.contents('p1').slice(-2)).toEqual(['t3', 'c6']);
  });

  it('rejects impossible deck placements with the reason', () => {
    const state = create();
    state.move([{ unit: 'c0', to: deck('p1') }]);
    expect(codes(state.check('c1', deck('p1', { layer: 0, position: 0 })))).toEqual(['position-taken']);
    state.move([1, 2, 3, 4, 5].map(i => ({ unit: `c${i}`, to: deck('p1', { layer: 0 }) })));
    expect(codes(state.check('c6', deck('p1', { layer: 0 })))).toEqual(['receptacle-full']);
    state.move([1, 2, 3, 4, 5].map(i => ({ unit: `c${i}`, to: { position: [0, 0, 0], yaw: 0 } })));
    // Without a layer, a taken position moves on to the next layer.
    expect(state.check('c1', deck('p1', { position: 0 })).placement).toMatchObject({ layer: 1, position: 0 });
    expect(codes(state.check('t0', deck('p1', { layer: 0 })))).toEqual(['position-taken']);
    expect(codes(state.check('c1', deck('p1', { position: 8 })))).toContain('unknown-target');
    expect(codes(state.check('c1', deck('p1', { layer: 3 })))[0]).toBe('no-support');
    expect(codes(state.check('c1', deck('p1', { layer: -1 })))).toEqual(['unknown-target']);
    expect(codes(state.check('c1', deck('p1', { pattern: 'logistics/nothing' })))).toEqual(['unknown-target']);
    expect(codes(state.check('c1', deck('p1', { pattern: 'logistics/tote-2x2' })))).toEqual(['class-not-accepted']);
    expect(codes(state.check('c1', deck('p1', { layer: 0, free: [.9, 0] })))).toEqual(['does-not-fit']);
    expect(codes(state.check('c1', deck('p1', { layer: 0, free: [-.39, -.235], turn: 90 })))).toEqual(['position-taken']);
    // One carton cannot carry a carton placed mostly beside it.
    expect(state.check('c1', deck('p1', { layer: 1, free: [.3, 0] })).violations[0]).toMatchObject({ code: 'no-support', blocking: ['c0'] });
    expect(state.check('c1', deck('p1', { layer: 1, pattern: 'logistics/carton-m-3x2', position: 0 })).ok).toBe(true);
    const bench = testState();
    expect(codes(bench.check('s1', { container: 'bench', receptacle: 'top' }))).toEqual(['unknown-target']);
    expect(bench.check('f1', { container: 'bench', receptacle: 'top', free: [0, 0], turn: 90 }).violations.map(entry => entry.code)).toEqual(['does-not-fit']);
  });

  it('only the top layer can be taken or loaded', () => {
    const state = create();
    loadCartons(state, 'p1', 0, 7);
    expect(state.check('c0', { container: 'shelf', receptacle: 'level-0' }).violations[0]).toMatchObject({ code: 'not-accessible', blocking: ['c6'] });
    expect(state.check('c6', { container: 'shelf', receptacle: 'level-0' }).ok).toBe(true);
    expect(codes(state.check('t0', deck('p1', { layer: 0 })))).toContain('not-accessible');
    expect(state.targets('c0')).toEqual([]);
  });

  it('enforces the deck load limit and the clear height of outer containers', () => {
    const state = create();
    state.move([{ unit: 'p1', to: { container: 'rack', receptacle: 'level-2' } }]);
    loadCartons(state, 'p1', 0, 18);
    expect(state.placement('c17')).toMatchObject({ layer: 2 });
    // Three layers of 0.33 m reach 1.2 m with the pallet; a fourth passes the bay's 1.22 m clear height.
    const blocked = state.check('c18', deck('p1'));
    expect(blocked.violations[0]).toMatchObject({ code: 'does-not-fit', blocking: ['p1'] });
    expect(blocked.violations[0].message).toContain('1.53 m');
    expect(state.move([{ unit: 'p1', to: { container: 'rack', receptacle: 'level-0' } }])[0].ok).toBe(true);
    // The floor bay's 1.44 m is still too low for a fourth layer; the jack's 2 m is not.
    expect(codes(state.check('c18', deck('p1')))).toEqual(['does-not-fit']);
    expect(state.move([{ unit: 'p1', to: { container: 'jack', receptacle: 'load' } }])[0].ok).toBe(true);
    loadCartons(state, 'p1', 18, 6);
    // Five layers of 0.33 m pass the pallet's own 1.6 m load limit.
    expect(state.check('c24', deck('p1')).violations[0].message).toContain('1.6 m load limit');
    // A loaded pallet that outgrew a bay cannot go back into it.
    expect(codes(state.check('p1', { container: 'rack', receptacle: 'level-0' }))).toEqual(['does-not-fit']);
  });

  it('a loaded container takes its contents along and cannot go inside itself', () => {
    const state = create();
    state.move([{ unit: 't0', to: deck('p1') }, { unit: 'p1', to: { container: 'jack', receptacle: 'load' } }]);
    expect(state.path('t0')).toEqual(['t0', 'p1', 'jack']);
    expect(state.contents('jack', { deep: true })).toEqual(['p1', 't0']);
    state.move([{ unit: 'p1', to: { container: 'rack', receptacle: 'level-0', position: 1 } }]);
    expect(state.path('t0')).toEqual(['t0', 'p1', 'rack']);
    expect(state.nodePatches(['t0'])[0].attachment).toEqual({ nodeId: 'p1', anchor: 'load' });
    expect(codes(state.check('p1', deck('p1')))).toEqual(['cycle']);
    expect(codes(state.check('p1', deck('t0')))).toEqual(['cycle']);
  });

  it('reports unknown units and targets, and refuses assets that are not units', () => {
    const state = create();
    expect(codes(state.check('ghost', deck('p1')))).toEqual(['unknown-unit']);
    expect(state.check('shelf', deck('p1')).violations[0].message).toContain('declares no handling unit');
    expect(state.check('c0', deck('ghost')).violations[0].message).toContain('Register the node first');
    expect(state.check('c0', { container: 'shelf', receptacle: 'attic' }).violations[0].message).toContain('level-0, level-1, level-2');
    expect(codes(state.check('c0', { position: [Number.NaN, 0, 0], yaw: 0 }))).toEqual(['unknown-target']);
  });

  it('moves atomically, each move seeing the previous ones, and stays silent on failure', () => {
    const state = create(), events: HandlingEvent[] = [];
    state.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-0' } }]);
    state.subscribe(event => events.push(event));
    const failed = state.move([{ unit: 'c1', to: { container: 'shelf', receptacle: 'level-0', position: 1 } }, { unit: 'c2', to: { container: 'shelf', receptacle: 'level-0', position: 1 } }, { unit: 'c3', to: deck('p1') }]);
    expect(failed.map(check => check.ok)).toEqual([true, false]);
    expect(state.placement('c1')).toBeUndefined();
    expect(events).toEqual([]);
    // Swapping two slots through a free one works because each step sees the one before.
    const swap = state.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-1' } }, { unit: 'c1', to: { container: 'shelf', receptacle: 'level-0', position: 0 } }]);
    expect(swap.every(check => check.ok)).toBe(true);
    expect(events.map(event => event.kind === 'moved' && event.unit)).toEqual(['c0', 'c1']);
    expect(events[0]).toMatchObject({ from: { receptacle: 'level-0' }, to: { receptacle: 'level-1' } });
    expect(events[1]).not.toHaveProperty('from');
  });

  it('lists compatible free targets, skipping the current place and honouring rank, limit and containers', () => {
    const state = create();
    state.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-2', position: 3 } }]);
    const all = state.targets('c0');
    expect(all.map(entry => `${entry.target.container} ${entry.target.receptacle} ${entry.target.position}`)).toContain('p1 deck 0');
    expect(all.some(entry => entry.target.container === 'rack')).toBe(false);
    expect(all.some(entry => entry.target.receptacle === 'level-2' && entry.target.position === 3)).toBe(false);
    expect(all).toHaveLength(2 + 11 + 1);
    expect(state.move([{ unit: 'c0', to: all[0].target }])[0].ok).toBe(true);
    expect(state.targets('c1', { containers: ['shelf'] }).every(entry => entry.target.container === 'shelf')).toBe(true);
    const ranked = state.targets('c1', { containers: ['shelf'], rank: entry => -(entry.placement.position ?? 0), limit: 2 });
    expect(ranked.map(entry => entry.placement.position)).toEqual([3, 3]);
    expect(state.targets('p1').map(entry => entry.target.container)).toEqual(expect.arrayContaining(['rack', 'jack']));
    expect(state.targets('ghost')).toEqual([]);
  });

  it('host rules veto physically valid moves and targets, never a sync', () => {
    const rule = vi.fn(({ unit, to }: { unit: string; to: object }) => unit === 'c0' && 'container' in to ? 'Order 42 is on hold.' : undefined);
    const state = create(rule);
    expect(state.check('c0', deck('p1')).violations).toEqual([{ code: 'host-rule', unit: 'c0', message: 'Order 42 is on hold.' }]);
    expect(state.check('c0', { position: [0, 0, 0], yaw: 0 }).ok).toBe(true);
    expect(state.targets('c0')).toEqual([]);
    expect(state.check('c0', { container: 'rack', receptacle: 'level-0' }).violations.map(entry => entry.code)).toEqual(['class-not-accepted']);
    rule.mockClear();
    expect(state.sync(new Map([['c0', deck('p1')]]))).toEqual([]);
    expect(rule).not.toHaveBeenCalled();
  });

  it('sync keeps impossible source data where it says, and reports it', () => {
    const state = create(), events: HandlingEvent[] = [];
    state.move([{ unit: 'c9', to: deck('p2') }]);
    state.subscribe(event => events.push(event));
    const source = new Map<string, HandlingTarget>([
      ['t0', deck('p1', { layer: 1, pattern: 'logistics/tote-2x2', position: 0 })],
      ['c0', deck('p1', { layer: 0, pattern: 'logistics/carton-m-3x2', position: 0 })],
      ['c1', deck('p1', { layer: 0, pattern: 'logistics/carton-m-3x2', position: 1 })],
      ['p2', { container: 'shelf', receptacle: 'level-0', position: 1 }],
      ['c2', { container: 'rack', receptacle: 'level-0', position: 0 }],
      ['c3', { container: 'shelf', receptacle: 'level-1', position: 0 }],
      ['c4', { container: 'shelf', receptacle: 'level-1', position: 0 }],
      ['c5', { container: 'missing', receptacle: 'deck' }],
      ['ghost', deck('p1')],
    ]);
    const violations = state.sync(source);
    expect(violations.map(entry => `${entry.unit} ${entry.code}`).sort()).toEqual(['c2 class-not-accepted', 'c4 position-taken', 'c5 unknown-target', 'ghost unknown-unit', 'p2 class-not-accepted', 'p2 does-not-fit', 't0 no-support'].sort());
    // Layer order in the source does not matter: t0 stands on the cartons, 0.33 m up, though they carry too little of it.
    expect((state.placement('t0') as ReceptaclePlacement).offset[1]).toBeCloseTo(.33);
    expect(state.placement('p2')).toMatchObject({ container: 'shelf', position: 1 });
    expect(state.path('c2')).toEqual(['c2', 'rack']);
    expect(state.placement('c3')).toMatchObject({ position: 0 });
    expect(state.placement('c4')).toMatchObject({ position: 0 });
    expect(state.nodePatches(['c5'])[0].attachment).toEqual({ nodeId: 'missing' });
    expect(state.placement('c9')).toBeUndefined();
    expect(events).toEqual([{ kind: 'synced', units: 8, violations: 7 }]);
  });

  it('sync does not apply a containment cycle', () => {
    const state = create();
    const violations = state.sync(new Map<string, HandlingTarget>([['t0', deck('p1', { free: [0, 0] })], ['p1', deck('t0')]]));
    expect(violations.map(entry => entry.code)).toContain('cycle');
    expect(state.placement('p1')).toBeUndefined();
    expect(state.path('t0')).toEqual(['t0', 'p1']);
  });

  it('patches agree with the models and the scene store', () => {
    const state = create(), pallet = catalogAssets.pallet({ id: 'p1', kind: 'asset', asset: 'pallet', count: 0 } as AssetNode), rack = catalogAssets['pallet-rack']({ id: 'rack', kind: 'asset', asset: 'pallet-rack', count: 0 } as AssetNode);
    state.move([{ unit: 'p2', to: { container: 'rack', receptacle: 'level-1', position: 1 } }, ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ unit: `c${i}`, to: deck('p1') })), { unit: 'c7', to: { position: [2, 0, 3], yaw: Math.PI / 2 } }]);
    const patches = new Map(state.nodePatches().map(patch => [patch.id, patch]));
    const world = (root: THREE.Object3D, anchor: string, local: readonly [number, number, number]) => root.getObjectByName(`anchor-${anchor}`)!.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...local));
    pallet.updateMatrixWorld(true); rack.updateMatrixWorld(true);
    const carton = world(pallet, 'load', patches.get('c0')!.position), upper = world(pallet, 'load', patches.get('c6')!.position), racked = world(rack, 'slot-3', patches.get('p2')!.position);
    expect(carton.toArray().map(value => Number(value.toFixed(3)))).toEqual([-.39, .21, -.235]);
    expect(upper.y).toBeCloseTo(.54);
    expect(racked.toArray().map(value => Number(value.toFixed(3)))).toEqual([.65, 1.56, 0]);
    expect(patches.get('c0')).toMatchObject({ attachment: { nodeId: 'p1', anchor: 'load' }, scale: [.4, .4, .4] });
    expect(patches.get('c0')!.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(patches.get('c7')).toMatchObject({ attachment: undefined, position: [2, 0, 3], rotation: [0, Math.PI / 2, 0], scale: [.4, .4, .4] });
    disposeObject(pallet); disposeObject(rack);
    const nodes: AssetNode[] = [{ id: 'p1', kind: 'asset', asset: 'pallet', count: 0 }, { id: 'c0', kind: 'asset', asset: 'parcel', position: [9, 9, 9] }, { id: 'c7', kind: 'asset', asset: 'parcel', attachment: { nodeId: 'p1', anchor: 'load' } }];
    const store = createSceneStore({ schemaVersion: 1, nodes });
    for (const node of nodes.slice(1)) store.upsert({ ...node, ...patches.get(node.id) });
    expect(store.getSnapshot().nodes.find(node => node.id === 'c0')).toMatchObject({ attachment: { nodeId: 'p1', anchor: 'load' }, scale: [.4, .4, .4] });
    expect(store.getSnapshot().nodes.find(node => node.id === 'c7')?.attachment).toBeUndefined();
    store.dispose();
  });

  it('scales envelopes and local transforms with a container placed at its handling scale', () => {
    const profile: HandlingProfile = { id: 'mini', name: 'Mini', classes: [{ id: 'mini/case', family: 'case', name: 'Case', size: { footprint: [.2, .2], height: .2 }, stacking: { maxAbove: 0, families: [] }, turnable: true }, { id: 'mini/crate', family: 'unit-load', name: 'Crate', size: { footprint: [.5, .5], height: .1 }, stacking: { maxAbove: 0, families: [] }, turnable: true }], patterns: [] };
    const handling: Record<string, AssetHandling> = {
      crate: { unit: { class: 'mini/crate', scale: .5 }, receptacles: [{ name: 'bed', arrangement: 'deck', anchor: 'bed', patterns: [], accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }] },
      case: { unit: { class: 'mini/case', scale: .25 }, receptacles: [] },
    };
    const state = createHandlingState({ handling, profiles: [profile], instances: [{ id: 'crate', asset: 'crate' }, { id: 'a', asset: 'case' }, { id: 'b', asset: 'case' }] });
    expect(state.check('a', { container: 'crate', receptacle: 'bed', free: [.3, 0] }).ok).toBe(false);
    state.move([{ unit: 'a', to: { container: 'crate', receptacle: 'bed', free: [.1, 0] } }]);
    expect(state.nodePatches()[0]).toMatchObject({ position: [.2, 0, 0], scale: [.5, .5, .5] });
  });

  it('registers, unregisters and subscribes with explicit lifecycles', () => {
    const state = create(), events: HandlingEvent[] = [];
    expect(() => state.register([{ id: 'p1', asset: 'pallet' }])).toThrow(/already registered/);
    expect(() => state.register([{ id: 'x', asset: 'tree-pine' }])).toThrow(/no handling declaration/);
    expect(() => createHandlingState({ handling: { bad: { receptacles: [] } }, profiles: handlingProfiles })).toThrow(/neither a unit nor a receptacle/);
    state.move([{ unit: 'c0', to: deck('p1') }, { unit: 'p1', to: { container: 'jack', receptacle: 'load' } }]);
    const stop = state.subscribe(event => events.push(event));
    expect(state.unregister('p1')).toEqual(['p1', 'c0']);
    expect(events.map(event => event.kind === 'unplaced' && event.unit)).toEqual(['p1', 'c0']);
    expect(state.contents('jack')).toEqual([]);
    expect(codes(state.check('p1', deck('p2')))).toEqual(['unknown-unit']);
    stop();
    state.move([{ unit: 'c0', to: deck('p2') }]);
    expect(events).toHaveLength(2);
  });

  it('the documented usage works as written', () => {
    const handling = createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances: [{ id: 'pallet-7', asset: 'pallet' }, { id: 'carton-1', asset: 'parcel' }, { id: 'rack-2', asset: 'pallet-rack' }, { id: 'shelf-1', asset: 'shelf' }] });
    expect(handling.move([{ unit: 'carton-1', to: { container: 'pallet-7', receptacle: 'deck' } }, { unit: 'pallet-7', to: { container: 'rack-2', receptacle: 'level-0' } }]).every(check => check.ok)).toBe(true);
    expect(handling.check('pallet-7', { container: 'shelf-1', receptacle: 'level-0' }).violations[0].code).toBe('class-not-accepted');
    expect(handling.nodePatches().map(patch => patch.id).sort()).toEqual(['carton-1', 'pallet-7']);
    const nearest = handling.targets('carton-1', { rank: ({ target }) => target.container === 'shelf-1' ? 0 : 1, limit: 3 });
    expect(nearest[0].target.container).toBe('shelf-1');
    expect(handling.move([{ unit: 'carton-1', to: nearest[0].target }])[0].ok).toBe(true);
    const violations = handling.sync(new Map([['carton-1', { container: 'pallet-7', receptacle: 'deck', layer: 0, position: 0 }], ['pallet-7', { container: 'shelf-1', receptacle: 'level-0' }]]));
    expect(violations.map(entry => `${entry.unit} ${entry.code}`)).toEqual(['pallet-7 class-not-accepted', 'pallet-7 does-not-fit']);
    expect(handling.path('carton-1')).toEqual(['carton-1', 'pallet-7', 'shelf-1']);
  });

  it('stays free of DOM, framework and Three.js imports', () => {
    const source = readFileSync('packages/core/src/handling-state.ts', 'utf8');
    expect([...source.matchAll(/from '([^']+)'/g)].map(match => match[1]).sort()).toEqual(['./attachment', './handling', './index']);
    expect(logisticsProfile.id).toBe('logistics');
  });
});
