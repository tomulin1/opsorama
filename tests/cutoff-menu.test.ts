import { describe, expect, it } from 'vitest';
import { validateScene, type AssetNode, type MarkerNode } from '@opsorama/core';
import { SKUS } from '../apps/site/src/features/ecommerce/model';
import { createShiftGame, type ShiftEvent } from '../apps/site/src/features/cutoff/rules';
import { GOODS_COLORS, choosesInScene, clickedNodes, detailOf, eventNode, menuEntries, menuSubjects, nodeEntries, needsTargets, pickTarget, rackRoom, targetMarks, targetNodes, type DetailContext } from '../apps/site/src/features/cutoff/menu';
import { goodsColored, playNodes } from '../apps/site/src/features/cutoff/scene';

const game = () => createShiftGame({ scenario: 'peak', seed: 1 });
const contextOf = (shift: ReturnType<typeof game>, node: string): DetailContext => {
  const nodes = shift.nodes();
  return { snapshot: shift.snapshot(), actors: shift.actors(), carriers: shift.carriers(), choices: shift.options(node), count: id => (nodes.find(item => item.id === id) as AssetNode | undefined)?.count };
};

describe('Cut-off context menus', () => {
  it('lists one entry per actor and kind of move, the active actor alone when it can act', () => {
    const shift = game();
    const [unload] = menuEntries(shift.options('dock:D1'));
    expect(unload).toMatchObject({ key: 'forklift:unload', label: 'Unload the truck', actor: { id: 'forklift' } });
    expect(unload.options.map(option => option.target)).toEqual(['Staging lane']);
    expect(needsTargets(unload)).toBe(false);
    // The reach truck has nothing to do with a dock, so the menu keeps the forklift's entry.
    expect(menuEntries(shift.options('dock:D1'), 'reach-truck').map(entry => entry.key)).toEqual(['forklift:unload']);

    const [putAway] = menuEntries(shift.options('pallet:1038'), 'reach-truck');
    expect(putAway).toMatchObject({ key: 'reach-truck:put-away', label: 'Put away' });
    expect(putAway.options.map(option => option.target)).toEqual(['R12 · level 1 · Toys', 'R05 · level 1 · Toys']);
    expect(putAway.refused[0]).toMatchObject({ target: 'R11 · Outdoor', reason: 'R11 holds Outdoor goods and does not take Toys (TOY-208).' });
    expect([needsTargets(putAway), choosesInScene(putAway)]).toEqual([true, true]);
    shift.dispose();
  });

  it('lights the targets in the scene and turns a click into a move, a refusal or nothing', () => {
    const shift = game(), snapshot = shift.snapshot(), [putAway] = menuEntries(shift.options('pallet:1038'), 'reach-truck');
    expect(targetMarks(putAway)).toEqual([{ nodeId: 'rack:R12', label: 'R12 · level 1 · Toys' }, { nodeId: 'rack:R05', label: 'R05 · level 1 · Toys' }]);
    expect([targetNodes({ kind: 'restock', department: 'toys', source: 'face' }), targetNodes({ kind: 'decant', face: 'S1' }), targetNodes({ kind: 'unload', dock: 'D1' })])
      .toEqual([['gondola:toys:0', 'gondola:toys:1'], ['shelf:S1'], []]);

    // The light marker stands for its rack, and so does a pallet standing in the rack.
    expect(pickTarget(putAway, clickedNodes('target:rack:R05', [], snapshot))).toMatchObject({ node: 'rack:R05', option: { move: { kind: 'put-away', pallet: 'pallet:1038', rack: 'R05' } } });
    expect(clickedNodes('pallet:1018', [], snapshot)).toEqual(['pallet:1018', 'rack:R05']);
    expect(pickTarget(putAway, clickedNodes('pallet:1018', [], snapshot))).toMatchObject({ node: 'rack:R05' });
    expect(pickTarget(putAway, ['rack:R04'])).toEqual({ refused: expect.objectContaining({ target: 'R04 · Outdoor', reason: expect.stringContaining('holds Outdoor goods') }) });
    expect(pickTarget(putAway, ['checkout:C1'])).toBeUndefined();

    const nodes = playNodes(shift, [], targetMarks(putAway)), markers = nodes.filter((node): node is MarkerNode => node.kind === 'marker');
    expect(markers.map(marker => [marker.id, marker.tone, marker.label])).toEqual([['target:rack:R12', 'success', 'R12 · level 1 · Toys'], ['target:rack:R05', 'success', 'R05 · level 1 · Toys']]);
    expect(validateScene({ schemaVersion: 1, nodes })).toEqual([]);
    shift.dispose();
  });

  it('offers a pick face the moves of the crew and the reserve pallets of its SKUs, for replenishing and restocking', () => {
    const shift = game(), subjects = menuSubjects('flow:F3', shift.snapshot());
    expect(subjects[0]).toBe('flow:F3');
    expect(subjects.slice(1).every(id => shift.snapshot().units.find(unit => unit.id === id)?.at === 'Rack R04')).toBe(true);
    expect(menuSubjects('rack:R05', shift.snapshot())).toEqual(['pallet:1018']);
    expect(menuSubjects('dock:D1', shift.snapshot())).toEqual(['dock:D1']);
    const entries = subjects.flatMap(subject => menuEntries(shift.options(subject)).map(entry => `${subject} ${entry.key} ${entry.options.length}`));
    expect(entries).toEqual(expect.arrayContaining([`${subjects[1]} reach-truck:replenish 1`, 'flow:F3 replenisher:decant 0', 'flow:F3 shelf-filler:restock 2']));

    // Bringing a reserve pallet makes the decant possible: it waits for the pallet.
    const [replenish] = menuEntries(shift.options(subjects[1]));
    shift.move('reach-truck', replenish.options[0].move);
    const [decant] = menuEntries(shift.options('flow:F3', 'replenisher'));
    expect(decant.options).toEqual([expect.objectContaining({ move: { kind: 'decant', face: 'F3' }, waits: expect.any(String) })]);
    expect(detailOf('flow:F3', contextOf(shift, 'flow:F3'))?.lines).toContainEqual({ label: 'Pallet', value: decant.options[0].waits });
    // The pallet on its way to F3 would repeat the face's own moves; the face's menu lists each of them once.
    shift.advance(3);
    expect(menuEntries(shift.options(subjects[1])).map(entry => entry.key)).toContain('replenisher:decant');
    const listed = nodeEntries('flow:F3', shift.snapshot(), subject => shift.options(subject)).map(item => item.entry.key);
    expect(listed.filter(key => key === 'replenisher:decant')).toHaveLength(1);
    expect(listed.filter(key => key === 'shelf-filler:restock')).toHaveLength(1);
    shift.dispose();
  });

  it('finds the object each event concerns', () => {
    const shift = game(), snapshot = shift.snapshot(), event = (kind: ShiftEvent['kind'], subject: string) => ({ kind, subject }) as ShiftEvent;
    const order = snapshot.orders.find(item => item.lines.some(line => snapshot.alerts.some(alert => alert.sku === line.sku)))!, short = order.lines.find(line => snapshot.alerts.some(alert => alert.sku === line.sku))!;
    expect([eventNode(snapshot, event('robot-breakdown', 'robot:0')), eventNode(snapshot, event('late-truck', 'D2')), eventNode(snapshot, event('store-rush', 'shop')), eventNode(snapshot, event('vip-order', order.id)), eventNode(snapshot, event('short-pick', order.id))])
      .toEqual(['robot:0', 'dock:D2', 'pin:shop', 'dock:D3', `flow:${SKUS[short.sku].pick}`]);
    expect(eventNode(snapshot, event('short-pick', 'no-such-order'))).toBeUndefined();
    shift.dispose();
  });

  it('details the selected object', () => {
    const shift = game(), detail = (node: string) => detailOf(node, contextOf(shift, node));
    expect(detail('pallet:1038')).toEqual({ title: 'Pallet 1038', eyebrow: 'PALLET', color: GOODS_COLORS.toys, lines: [
      { label: 'SKU', value: 'TOY-208 · Puzzle, 1000 pieces' }, { label: 'Goods', value: 'Toys' }, { label: 'Cartons', value: '9' },
      { label: 'Stands', value: 'In staging' }, { label: 'May go', value: 'R12 · level 1 · Toys (+1 more)' },
    ] });
    expect(detail('pallet:1018')?.lines).toContainEqual({ label: 'Stands', value: 'Rack R05' });
    expect(detail('rack:R05')).toMatchObject({ title: 'R05', color: GOODS_COLORS.toys, lines: [{ label: 'Goods', value: 'Toys only' }, { label: 'Pallets', value: '1 of 6 positions' }, { label: 'Holds', value: 'TOY-208' }] });
    expect(detail('flow:F3')?.lines).toContainEqual({ label: 'Below minimum', value: expect.stringContaining('OUT-215') });
    expect(detail('dock:D1')).toMatchObject({ title: 'Dock D1', eyebrow: 'INBOUND DOCK', lines: expect.arrayContaining([{ label: 'Reference', value: 'PO-7779' }]) });
    expect(detail('forklift')).toMatchObject({ title: 'Forklift', eyebrow: 'CREW', lines: expect.arrayContaining([{ label: 'Commands', value: '0 of 3' }]) });
    expect(detail('cage:swift-1')).toMatchObject({ title: 'Roll cage swift-1', lines: expect.arrayContaining([{ label: 'Carrier', value: 'SwiftPost' }]) });
    expect(detail('gondola:toys:0')).toMatchObject({ title: 'Toys', eyebrow: 'SHOP DEPARTMENT' });
    expect(detail('checkout:C1')).toBeNull();
    shift.dispose();
  });

  it('colors pallets and racks by type of goods, counts free rack positions and keeps the floors out of clicks', () => {
    const shift = game(), snapshot = shift.snapshot(), nodes = goodsColored(shift.nodes(), snapshot), byId = new Map(nodes.map(node => [node.id, node]));
    expect((byId.get('pallet:1038') as AssetNode).color).toBe(GOODS_COLORS.toys);
    expect((byId.get('pallet:1024') as AssetNode).color).toBe(GOODS_COLORS.bulky);
    expect((byId.get('rack:R12') as AssetNode).materials?.accent).toBe(GOODS_COLORS.toys);
    expect(nodes.filter(node => node.id.startsWith('area:') || node.id.startsWith('pin:')).every(node => node.selectable === false)).toBe(true);
    const toys = rackRoom(snapshot).find(item => item.goods === 'toys')!;
    expect(toys).toEqual({ goods: 'toys', label: 'Toys', color: GOODS_COLORS.toys, free: 12 - snapshot.occupancy.R05 - snapshot.occupancy.R12, total: 12 });
    expect(rackRoom(snapshot).reduce((sum, item) => sum + item.total, 0)).toBe(14 * 6);
    shift.dispose();
  });
});
