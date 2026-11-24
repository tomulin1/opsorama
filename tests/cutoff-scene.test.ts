import { describe, expect, it } from 'vitest';
import type { AssetNode } from '@opsorama/core';
import { createShiftGame } from '../apps/site/src/features/cutoff/rules';
import { gameNodes, zoneAt } from '../apps/site/src/features/cutoff/scene';

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
});
