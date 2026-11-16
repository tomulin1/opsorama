import { describe, expect, it } from 'vitest';
import type { AssetNode, SceneNode, Vec3 } from '@opsorama/core';
import { closeWallJoints } from '../apps/site/src/features/example-walls';
import { ecommerceBase } from '../apps/site/src/features/ecommerce/scene';
import { officeBase } from '../apps/site/src/features/office/scene';
import { restaurantBase } from '../apps/site/src/features/restaurant/model';
import { warehouseBase } from '../apps/site/src/features/warehouse/scene';

const QUARTER = Math.PI / 2;
const wall = (id: string, position: Vec3, heading = 0, scale?: Vec3): AssetNode =>
  ({ id, kind: 'asset', asset: 'wall-segment', position, rotation: [0, heading, 0], color: '#dde3ea', selectable: false, ...(scale ? { scale } : {}) });
const fillers = (nodes: readonly SceneNode[]) => closeWallJoints(nodes).slice(nodes.length) as AssetNode[];

describe('closeWallJoints', () => {
  it('fills the open outer corner where two walls meet at their centre lines', () => {
    // Back wall x −4…0 at z 0; side wall z 0…4 at x 0.
    const [post, ...rest] = fillers([wall('back', [-2, 0, 0]), wall('side', [0, 0, 2], QUARTER)]);
    expect(rest).toEqual([]);
    expect(post).toMatchObject({ id: 'wall-joint:back:side', asset: 'wall-segment', variant: 'solid', color: '#dde3ea', selectable: false });
    expect(post.position![0]).toBeCloseTo(0); expect(post.position![2]).toBeCloseTo(0);
    expect(post.scale![0] * 4).toBeCloseTo(.15); expect(post.scale![1]).toBeCloseTo(1); expect(post.scale![2] * .15).toBeCloseTo(.15);
  });

  it('extends a wall that stops short of a corner, up to 1 m', () => {
    // Back wall ends at x 0; the side wall stands 0.8 m further at x 0.8.
    const [post] = fillers([wall('back', [-2, 0, 0]), wall('side', [.8, 0, 2], QUARTER)]);
    expect(post.position![0]).toBeCloseTo(.4375); expect(post.scale![0] * 4).toBeCloseTo(.875);
    expect(fillers([wall('back', [-2, 0, 0]), wall('side', [1.5, 0, 2], QUARTER)])).toEqual([]);
  });

  it('closes a T joint and spans only the shared height', () => {
    // A low partition ends 2.5 cm before the face of a full-height wall that runs past it.
    const [post] = fillers([wall('outer', [0, 0, 0], QUARTER), wall('partition', [2.1, 0, 0], 0, [1, .42, 1])]);
    expect(post.id).toBe('wall-joint:partition:outer');
    expect(post.scale![0] * 4).toBeCloseTo(.025); expect(post.scale![1]).toBeCloseTo(.42);
  });

  it('leaves closed, separated and non-orthogonal walls alone', () => {
    // The back wall already reaches the side wall's outer face.
    expect(fillers([wall('back', [-2, 0, 0], 0, [4.15 / 4, 1, 1]), wall('side', [0, 0, 2], QUARTER)])).toEqual([]);
    expect(fillers([wall('low', [-2, -3, 0]), wall('side', [0, 0, 2], QUARTER)])).toEqual([]);
    expect(fillers([wall('back', [-2, 0, 0]), wall('side', [0, 0, 2], QUARTER / 2)])).toEqual([]);
  });

  it('leaves no open wall joint in the domain examples', () => {
    for (const [name, base] of Object.entries({ ecommerceBase, officeBase, restaurantBase, warehouseBase })) {
      expect(fillers(base), name).toEqual([]);
      expect(base.some(node => node.id.startsWith('wall-joint:')), name).toBe(true);
    }
  });
});
