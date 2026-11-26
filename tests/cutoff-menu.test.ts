import { describe, expect, it } from 'vitest';
import { validateScene, type AssetNode, type MarkerNode } from '@opsorama/core';
import { SKUS } from '../apps/site/src/features/ecommerce/model';
import { createShiftGame, type ShiftEvent } from '../apps/site/src/features/cutoff/rules';
import { GOODS_COLORS, SOURCE_TINT, STAGING_TARGET, TARGET_TINT, actorSources, goodsLegend, sourceTints, targetTints, clickedNodes, markAnchor, detailOf, eventNode, pickTarget, rackRoom, sourceMarks, targetMarks, targetNodes, type DetailContext } from '../apps/site/src/features/cutoff/menu';
import { playable, playNodes } from '../apps/site/src/features/cutoff/scene';
import { GOODS_TONES } from '@opsorama/objects';
/** Move options without their ghost places, which the tests of previews check on their own. */
const bare = <T extends { previews?: unknown }>(items: readonly T[]) => items.map(item => { const { previews, ...rest } = item; void previews; return rest; });

const game = () => createShiftGame({ scenario: 'peak', seed: 1 });
const contextOf = (shift: ReturnType<typeof game>, node: string): DetailContext => {
  const nodes = shift.nodes();
  return { snapshot: shift.snapshot(), actors: shift.actors(), carriers: shift.carriers(), choices: shift.options(node), count: id => (nodes.find(item => item.id === id) as AssetNode | undefined)?.count };
};

describe('Cut-off commands: actor, source, target', () => {
  it('lights what each of the crew can take, with every possible move once', () => {
    const shift = game(), snapshot = shift.snapshot(), sources = (actor: string) => actorSources(actor, snapshot, (subject, who) => shift.options(subject, who));
    expect(sources('forklift').map(source => ({ ...source, options: bare(source.options) }))).toEqual([{ node: 'dock:D1', label: 'Dock D1 · 6 pallets left', options: [{ move: { kind: 'unload', dock: 'D1' }, target: 'Staging lane' }], refused: [] }]);
    // The next pallet off the truck would stand in the free staging spot, after the five staged ones.
    expect(sources('forklift')[0].options[0].previews).toEqual([{ position: [16.2, expect.any(Number), -7.1], size: [1.3, 1.4, 1.3], ghost: { asset: 'pallet', count: 9 } }]);
    const reach = sources('reach-truck'), staged = reach.find(source => source.node === 'pallet:1038')!;
    expect(staged.label).toBe('Pallet 1038 · TOY-208 · staging');
    // Any free rack place, whatever the goods; each shows a ghost of the pallet itself there, turned a quarter as pallets stand in racks.
    expect(staged.options).toHaveLength(rackRoom(snapshot).free);
    expect(staged.options[0].target).toMatch(/^R\d\d · level 1 · place 1$/);
    expect(staged.options.every(option => option.previews?.length === 1)).toBe(true);
    expect(staged.options[0].previews).toEqual([expect.objectContaining({ node: `rack:${staged.options[0].target.slice(0, 3)}`, anchor: expect.any(String), ghost: 'pallet:1038', yaw: Math.PI / 2 })]);
    expect(staged.refused.every(item => / is full\.$/.test(item.reason))).toBe(true);
    // Everything it can technically take: the staged pallets to put away and every reserve pallet whose face has room behind it.
    expect(reach.find(source => source.node === 'pallet:1016')).toMatchObject({ label: 'Pallet 1016 · OUT-215 · rack R04', options: [{ move: { kind: 'replenish', pallet: 'pallet:1016' }, target: 'Behind F3' }] });
    expect(reach.filter(source => source.options[0].move.kind === 'put-away')).toHaveLength(5);
    // The menu lists the staged pallets first, then reserve pallets of SKUs below their minimum (OUT-215, KIT-104, TOY-120).
    expect(reach.slice(0, 5).every(source => source.options[0].move.kind === 'put-away')).toBe(true);
    expect(reach[5].label).toMatch(/KIT-104|OUT-215|TOY-120/);
    expect(reach.length).toBeGreaterThan(30);
    expect(sources('replenisher')).toEqual([]);
    expect(sources('shelf-filler').map(source => source.node)).toEqual(expect.arrayContaining(['flow:F3', 'flow:S2']));
    expect(sources('shelf-filler').every(source => source.node.startsWith('flow:') && source.options.every(option => option.move.kind === 'restock'))).toBe(true);
    expect(sources('dispatcher').every(source => source.node.startsWith('cage:'))).toBe(true);

    // A pallet with a queued command is not offered again.
    shift.move('reach-truck', { kind: 'put-away', pallet: 'pallet:1038', rack: 'R12' });
    const queued = shift.actors().flatMap(actor => actor.queue);
    expect(actorSources('reach-truck', shift.snapshot(), (subject, who) => shift.options(subject, who), queued).some(source => source.node === 'pallet:1038')).toBe(false);
    // Bringing a reserve pallet makes the decant possible: the face lights for the replenisher, waiting for the pallet.
    shift.move('reach-truck', { kind: 'replenish', pallet: 'pallet:1016' });
    const [decant] = actorSources('replenisher', shift.snapshot(), (subject, who) => shift.options(subject, who));
    expect(decant).toMatchObject({ node: 'flow:F3', label: 'F3 lanes', options: [{ move: { kind: 'decant', face: 'F3' }, waits: expect.any(String) }] });
    expect(detailOf('flow:F3', contextOf(shift, 'flow:F3'))?.lines).toContainEqual({ label: 'Pallet', value: decant.options[0].waits });
    // Once the pallet is on its way, the decant is offered by the pallet and by the face, and listed once.
    shift.advance(3);
    const after = actorSources('replenisher', shift.snapshot(), (subject, who) => shift.options(subject, who));
    expect(after.flatMap(source => source.options).filter(option => option.move.kind === 'decant')).toHaveLength(1);
    shift.dispose();
  });

  it('lights the targets of a taken source and turns a click into a move, a refusal or nothing', () => {
    const shift = game(), snapshot = shift.snapshot(), reach = actorSources('reach-truck', snapshot, (subject, who) => shift.options(subject, who));
    const staged = reach.find(source => source.node === 'pallet:1038')!, rack = reach.find(source => source.node === 'pallet:1016')!;
    // One mark per rack with a free place, named after its lowest free place.
    const marks = targetMarks(staged, snapshot), withRoom = new Set(staged.options.map(option => option.move.kind === 'put-away' && option.move.rack));
    expect(marks).toHaveLength(withRoom.size);
    expect(marks[0]).toEqual({ key: `rack:${staged.options[0].target.slice(0, 3)}`, kind: 'target', label: staged.options[0].target });
    expect(targetMarks(rack, snapshot)).toEqual([{ key: 'flow:F3', kind: 'target', label: 'Behind F3' }]);
    expect([targetNodes({ kind: 'restock', department: 'toys', source: 'face' }), targetNodes({ kind: 'decant', face: 'S1' }), targetNodes({ kind: 'unload', dock: 'D1' }), targetNodes({ kind: 'clear', face: 'F3' }), targetNodes({ kind: 'ship', cage: 'swift-1' })])
      .toEqual([['gondola:toys:0', 'gondola:toys:1', 'gondola:toys:2', 'gondola:toys:3'], ['flow:S1'], [STAGING_TARGET], ['pallet-stack'], ['dock:D3']]);

    // A light marker stands for its node, and a pallet standing in a rack for the rack.
    expect(pickTarget(staged, clickedNodes('target:rack:R05', [], snapshot), snapshot)).toMatchObject({ node: 'rack:R05', option: { move: { kind: 'put-away', pallet: 'pallet:1038', rack: 'R05' } } });
    expect(clickedNodes('source:pallet:1038', [], snapshot)).toEqual(['pallet:1038']);
    expect(clickedNodes('pallet:1018', [], snapshot)).toEqual(['pallet:1018', 'rack:R05']);
    expect(pickTarget(staged, clickedNodes('pallet:1018', [], snapshot), snapshot)).toMatchObject({ node: 'rack:R05' });
    // A Toys pallet may go into an Outdoor rack too; only a full rack refuses it.
    expect(pickTarget(staged, ['rack:R04'], snapshot)).toMatchObject({ node: 'rack:R04', option: { move: { kind: 'put-away', pallet: 'pallet:1038', rack: 'R04' } } });
    const full = staged.refused[0];
    if (full) expect(pickTarget(staged, [`rack:${full.target}`], snapshot)).toEqual({ refused: expect.objectContaining({ reason: `${full.target} is full.` }) });
    expect(pickTarget(staged, ['checkout:C1'], snapshot)).toBeUndefined();
    expect(pickTarget(rack, ['flow:F3'], snapshot)).toMatchObject({ option: { move: { kind: 'replenish', pallet: 'pallet:1016' } } });

    // The page puts a Take pill over every source and a Bring here pill over every target; the staging lane's pill stands over
    // the receiving check beside it, and the problem markers step aside while a command is given.
    expect(sourceMarks(reach).every(mark => mark.kind === 'source')).toBe(true);
    expect([markAnchor('rack:R12'), markAnchor(STAGING_TARGET)]).toEqual(['rack:R12', 'qa:station']);
    const markers = (commanding: boolean) => playNodes(shift, [], commanding).filter((node): node is MarkerNode => node.kind === 'marker');
    expect(markers(false).length).toBeGreaterThan(0);
    expect(markers(true)).toEqual([]);
    expect(validateScene({ schemaVersion: 1, nodes: playNodes(shift, [], true) })).toEqual([]);
    shift.dispose();
  });

  it('finds the object each event concerns', () => {
    const shift = game(), snapshot = shift.snapshot(), event = (kind: ShiftEvent['kind'], subject: string) => ({ kind, subject }) as ShiftEvent;
    const order = snapshot.orders.find(item => item.lines.some(line => snapshot.alerts.some(alert => alert.sku === line.sku)))!, short = order.lines.find(line => snapshot.alerts.some(alert => alert.sku === line.sku))!;
    expect([eventNode(snapshot, event('robot-breakdown', 'robot:0')), eventNode(snapshot, event('late-truck', 'D2')), eventNode(snapshot, event('store-rush', 'shop')), eventNode(snapshot, event('vip-order', order.id)), eventNode(snapshot, event('short-pick', order.id))])
      .toEqual(['robot:0', 'dock:D2', 'checkout:C2', 'dock:D3', `flow:${SKUS[short.sku].pick}`]);
    expect(eventNode(snapshot, event('short-pick', 'no-such-order'))).toBeUndefined();
    shift.dispose();
  });

  it('details the selected object', () => {
    const shift = game(), detail = (node: string) => detailOf(node, contextOf(shift, node));
    expect(detail('pallet:1038')).toEqual({ title: 'Pallet 1038', eyebrow: 'PALLET', color: GOODS_COLORS.toys, lines: [
      { label: 'SKU', value: 'TOY-208 · Puzzle, 1000 pieces' }, { label: 'Goods', value: 'Toys' }, { label: 'Cartons', value: '9' },
      { label: 'Stands', value: 'In staging' }, { label: 'May go', value: 'R12 · level 1 · place 1 (+45 more)' },
    ] });
    expect(detail('pallet:1018')?.lines).toContainEqual({ label: 'Stands', value: 'Rack R05' });
    expect(detail('rack:R05')).toEqual({ title: 'R05', eyebrow: 'RESERVE RACK', lines: [{ label: 'Pallets', value: '1 of 6 positions · any goods' }, { label: 'Holds', value: 'TOY-208' }] });
    expect(detail('flow:F3')?.lines).toContainEqual({ label: 'Below minimum', value: expect.stringContaining('OUT-215') });
    expect(detail('dock:D1')).toMatchObject({ title: 'Dock D1', eyebrow: 'INBOUND DOCK', lines: expect.arrayContaining([{ label: 'Reference', value: 'PO-7779' }]) });
    expect(detail('forklift')).toMatchObject({ title: 'Forklift', eyebrow: 'CREW', lines: expect.arrayContaining([{ label: 'Commands', value: '0 of 3' }]) });
    expect(detail('cage:swift-1')).toMatchObject({ title: 'Roll cage swift-1', lines: expect.arrayContaining([{ label: 'Carrier', value: 'SwiftPost' }]) });
    expect(detail('gondola:toys:0')).toMatchObject({ title: 'Toys', eyebrow: 'SHOP DEPARTMENT' });
    expect(detail('checkout:C1')).toBeNull();
    shift.dispose();
  });

  it('colors pallets, pick faces and gondolas by type of goods, keeps racks neutral, counts free rack positions and keeps the floors out of clicks', () => {
    const shift = game(), snapshot = shift.snapshot(), nodes = playable(shift.nodes(), snapshot), byId = new Map(nodes.map(node => [node.id, node]));
    // One color per type: the body tone of the type's iconic item in the shop.
    expect(GOODS_COLORS).toEqual(GOODS_TONES);
    expect([(byId.get('flow:F4') as AssetNode).materials?.surface, (byId.get('flow:S2') as AssetNode).materials?.surface, (byId.get('gondola:sport:1') as AssetNode).color]).toEqual([GOODS_COLORS.toys, GOODS_COLORS.sport, GOODS_COLORS.sport]);
    expect((byId.get('flow:S1') as AssetNode).asset).toBe('carton-flow-rack');
    expect((byId.get('pallet:1038') as AssetNode).color).toBe(GOODS_COLORS.toys);
    expect((byId.get('pallet:1024') as AssetNode).color).toBe(GOODS_COLORS.sport);
    // Any pallet may stand in any rack, so the racks keep their own colors.
    expect((byId.get('rack:R12') as AssetNode).materials?.accent).toBeUndefined();
    expect(nodes.filter(node => node.id.startsWith('area:')).every(node => node.selectable === false)).toBe(true);
    expect(nodes.some(node => node.id.startsWith('pin:'))).toBe(false);
    const racks = Object.entries(snapshot.occupancy).filter(([id]) => id.startsWith('R')).reduce((sum, [, count]) => sum + count, 0);
    expect(rackRoom(snapshot)).toEqual({ free: 14 * 6 - racks, total: 14 * 6 });
    expect(goodsLegend().map(item => [item.label, item.color])).toEqual([['Kitchen', GOODS_COLORS.kitchen], ['Home', GOODS_COLORS.home], ['Outdoor', GOODS_COLORS.outdoor], ['Toys', GOODS_COLORS.toys], ['Tech', GOODS_COLORS.tech], ['Sport', GOODS_COLORS.sport]]);
    shift.dispose();
  });
});

describe('Cut-off tints and ghosts', () => {
  it('tints the sources, with the truck at a dock, then the taken source and the targets that would wait', () => {
    const shift = game(), snapshot = shift.snapshot(), sources = (actor: string) => actorSources(actor, snapshot, (subject, who) => shift.options(subject, who));
    expect(sourceTints(sources('forklift'))).toEqual([{ node: 'dock:D1', color: SOURCE_TINT }, { node: 'truck:D1', color: SOURCE_TINT }]);
    const staged = sources('reach-truck').find(source => source.node === 'pallet:1038')!;
    // Both racks show a ghost, so only the pallet itself is tinted.
    expect(targetTints(staged, snapshot)).toEqual([{ node: 'pallet:1038', color: SOURCE_TINT }]);
    // A move that would wait has no ghost: its target node is tinted instead, and the staging lane has no node to tint.
    const waiting = { node: 'dock:D1', options: [{ move: { kind: 'unload' as const, dock: 'D1' as const }, target: 'Staging lane', waits: 'Waits for room.' }, { move: { kind: 'put-away' as const, pallet: 'pallet:1038', rack: 'R12' as const }, target: 'R12', waits: 'Waits.' }] };
    expect(targetTints(waiting, snapshot)).toEqual([{ node: 'dock:D1', color: SOURCE_TINT }, { node: 'truck:D1', color: SOURCE_TINT }, { node: 'rack:R12', color: TARGET_TINT }]);
    shift.dispose();
  });
});
