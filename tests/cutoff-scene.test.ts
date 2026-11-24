import { describe, expect, it } from 'vitest';
import { validateScene, type AssetNode, type MarkerNode, type TextNode } from '@opsorama/core';
import { SHIFT_LEVELS, createShiftGame, type ShiftEvent } from '../apps/site/src/features/cutoff/rules';
import { FLOAT_SECONDS, floatingNodes, gameNodes, lightingAt, playNodes, zoneAt } from '../apps/site/src/features/cutoff/scene';

describe('Cut-off scene', () => {
  it('maps clicked nodes to the zones a person can be sent to', () => {
    expect(['area:packing', 'pin:packing', 'pack:K2', 'area:picking', 'flow:F3', 'shelf:S1', 'pin:shop', 'gondola:garden:0', 'area:dispatch', 'checkout:C1', 'picker:0'].map(zoneAt))
      .toEqual(['packing', 'packing', 'packing', 'replenishing', 'replenishing', 'replenishing', 'restocking', 'restocking', null, null, null]);
  });

  it('makes movable people selectable and marks the zones of the selected one', () => {
    const game = createShiftGame({ scenario: 'peak' }), staff = game.staff(), byId = (nodes: ReturnType<typeof gameNodes>, id: string) => nodes.find(node => node.id === id) as AssetNode;
    const plain = gameNodes(game.nodes(), staff, null);
    expect(byId(game.nodes(), 'packer:K3').selectable).toBe(false);
    expect(byId(plain, 'packer:K3').selectable).toBe(true);
    expect(byId(plain, 'picker:0').selectable).toBe(true);
    expect(byId(plain, 'pin:shop').label).toBe('Shop floor');
    const marked = gameNodes(game.nodes(), staff, 'packer:K3');
    expect(byId(marked, 'pin:shop')).toMatchObject({ state: 'busy', label: 'Send here · Shop restocking' });
    expect(byId(marked, 'pin:picking')).toMatchObject({ state: 'busy', label: 'Send here · Replenishing' });
    // The person's own zone and the zones they cannot work in are dimmed.
    expect(byId(marked, 'pin:packing').state).toBe('inactive');
    expect(byId(marked, 'pin:dispatch').state).toBe('inactive');
    // A fixed person marks nothing.
    expect(gameNodes(game.nodes(), staff, 'picker:0')).toEqual(plain);
    game.dispose();
  });

  it('lights the shift by the clock: studio by day, dusk from 16:00, night on the night shift', () => {
    expect(['10:00', '15:59', '16:00', '18:00'].map(clock => lightingAt(SHIFT_LEVELS.peak, clock))).toEqual(['studio', 'studio', 'dusk', 'dusk']);
    expect(lightingAt(SHIFT_LEVELS.night, '22:00')).toBe('night');
  });

  it('marks problems on the objects they concern, and the scene stays valid', () => {
    const game = createShiftGame({ scenario: 'peak' }), opened: ShiftEvent[] = [];
    game.subscribe(notice => { if (notice.type === 'event-opened') opened.push(notice.event); });
    while (!opened.some(event => event.kind === 'robot-breakdown')) game.advance(1);
    const nodes = playNodes(game, null, []), markers = nodes.filter((node): node is MarkerNode => node.kind === 'marker');
    const on = (id: string) => markers.find(marker => marker.attachment?.nodeId === id);
    expect(on('robot:0')).toMatchObject({ tone: 'critical', label: 'Robot down' });
    // The D2 truck docked without permission to unload.
    expect(on('dock:D2')).toMatchObject({ tone: 'info', label: 'PO-7782 waits to unload' });
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
