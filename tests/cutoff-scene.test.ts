import { describe, expect, it } from 'vitest';
import { validateScene, type MarkerNode, type TextNode } from '@opsorama/core';
import { SHIFT_LEVELS, createShiftGame, type ShiftEvent } from '../apps/site/src/features/cutoff/rules';
import { FLOAT_SECONDS, floatingNodes, lightingAt, moveLabel, playNodes } from '../apps/site/src/features/cutoff/scene';

describe('Cut-off scene', () => {
  it('names every kind of command for the crew panel and the log', () => {
    expect([
      moveLabel({ kind: 'unload', dock: 'D1' }), moveLabel({ kind: 'put-away', pallet: 'pallet:1038', rack: 'R12' }), moveLabel({ kind: 'put-away', pallet: 'pallet:1038', rack: 'R05', level: 1 }),
      moveLabel({ kind: 'replenish', pallet: 'pallet:1015' }), moveLabel({ kind: 'clear', face: 'F3' }), moveLabel({ kind: 'decant', face: 'F3' }),
      moveLabel({ kind: 'restock', department: 'toys', source: 'face' }), moveLabel({ kind: 'restock', department: 'home', source: 'transfer' }), moveLabel({ kind: 'ship', cage: 'swift-1' }),
    ]).toEqual([
      'Unload the truck at D1', 'Put pallet 1038 away to R12', 'Put pallet 1038 away to R05 level 2',
      'Bring pallet 1015 behind its pick face', 'Take the empty pallet from F3 to the stack', 'Fill F3 from its pallet',
      'Restock Toys', 'Take the shop transfer to Home', 'Load swift-1 onto the truck',
    ]);
  });

  it('lights the shift by the clock: studio by day, dusk from 16:00, night on the night shift', () => {
    expect(['10:00', '15:59', '16:00', '18:00'].map(clock => lightingAt(SHIFT_LEVELS.peak, clock))).toEqual(['studio', 'studio', 'dusk', 'dusk']);
    expect(lightingAt(SHIFT_LEVELS.night, '22:00')).toBe('night');
  });

  it('marks problems and waiting crew on the objects they concern, and the scene stays valid', () => {
    const game = createShiftGame({ scenario: 'peak' }), opened: ShiftEvent[] = [];
    game.subscribe(notice => { if (notice.type === 'event-opened') opened.push(notice.event); });
    game.move('forklift', { kind: 'unload', dock: 'D1' });
    while (!opened.some(event => event.kind === 'robot-breakdown')) game.advance(1);
    const nodes = playNodes(game, []), markers = nodes.filter((node): node is MarkerNode => node.kind === 'marker');
    const on = (id: string) => markers.find(marker => marker.attachment?.nodeId === id);
    expect(on('robot:0')).toMatchObject({ tone: 'critical', label: 'Robot down' });
    // The D2 truck docked and nobody unloads it; the forklift waits for room in the full staging lane.
    expect(on('dock:D2')).toMatchObject({ tone: 'info', label: 'PO-7782 waits to unload', detail: 'Command the forklift to unload dock D2' });
    expect(on('forklift')).toMatchObject({ tone: 'info', eyebrow: 'WAITS', label: 'Forklift', detail: 'Waits for room in staging.' });
    expect(new Set(markers.map(marker => marker.id)).size).toBe(markers.length);
    expect(validateScene({ schemaVersion: 1, nodes })).toEqual([]);
    game.dispose();
  });

  it('floats point changes over their object, rising, until they expire', () => {
    const present = new Set(['checkout:C1']), floats = [{ id: 1, points: 2, at: 'checkout:C1', start: 10 }, { id: 2, points: -4, at: 'checkout:C1', start: 9 }, { id: 3, points: 5, at: 'rack:R99', start: 10 }];
    const [served, left] = floatingNodes(floats, present, 10) as TextNode[];
    expect(served).toMatchObject({ kind: 'text', text: '+2', billboard: true, attachment: { nodeId: 'checkout:C1' }, color: '#1f8a5b' });
    expect(left).toMatchObject({ text: '-4', color: '#c43650' });
    expect(left.position![1]).toBeGreaterThan(served.position![1]);
    expect(floatingNodes(floats, present, 10 + FLOAT_SECONDS)).toHaveLength(0);
  });
});
