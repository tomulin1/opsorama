import type { AssetNode, SceneNode } from '@opsorama/core';

/**
 * Closes wall joints in website example scenes built from `wall-segment` nodes.
 *
 * A `wall-segment` is a 4 × 2.65 × 0.15 m box (panel plus cap) whose pivot lies on its centre line. When two
 * perpendicular runs meet, their ends stop at a centre line or short of the other wall's face, so the outer corner of
 * an L joint, or the joint of a T, stays open. `closeWallJoints` returns the nodes unchanged plus one solid
 * `wall-segment` filler per open joint, sized to the joint and coloured like the wall it continues.
 *
 * Rules (website example helper, not a package API):
 * - Only top-level `wall-segment` asset nodes without `parentId` or `attachment`, turned by a multiple of 90° about
 *   y, take part; other rotations are ignored.
 * - A wall end within `WALL_JOINT_MAX_GAP` (1 m) of a perpendicular wall forms a joint. Keep intended openings
 *   wider than that, or away from corners.
 * - Walls must share at least 0.1 m of height; a filler spans only the shared height.
 * - A joint already covered by another wall gets no filler.
 */
export const WALL_JOINT_MAX_GAP = 1;
/** `wall-segment` dimensions in metres at scale 1: length along local x, height including the cap, thickness along z. */
const WALL = { length: 4, height: 2.65, thickness: .15 } as const;
/** Shared height a joint needs, the thinnest gap worth a filler, and the coverage tolerance, in metres. */
const MIN_SHARED_HEIGHT = .1, MIN_FILLER = .005, EPSILON = .001;

type Range = readonly [number, number];
interface WallBox { node: AssetNode; axis: 'x' | 'z'; x: Range; y: Range; z: Range; }

function wallBox(node: SceneNode): WallBox | undefined {
  if (node.kind !== 'asset' || node.asset !== 'wall-segment' || node.parentId || node.attachment || !node.position) return undefined;
  const [pitch = 0, heading = 0, roll = 0] = node.rotation ?? [];
  const quarter = Math.round(heading / (Math.PI / 2));
  if (pitch || roll || Math.abs(heading - quarter * Math.PI / 2) > 1e-6) return undefined;
  const [sx, sy, sz] = node.scale ?? [1, 1, 1], [x, y, z] = node.position;
  const half = WALL.length / 2 * Math.abs(sx), thick = WALL.thickness / 2 * Math.abs(sz), alongX = quarter % 2 === 0;
  const top = y + WALL.height * sy;
  return { node, axis: alongX ? 'x' : 'z', x: alongX ? [x - half, x + half] : [x - thick, x + thick], y: [Math.min(y, top), Math.max(y, top)], z: alongX ? [z - thick, z + thick] : [z - half, z + half] };
}

const hull = (value: number, range: Range): Range => [Math.min(value, range[0]), Math.max(value, range[1])];
const inside = (value: number, range: Range) => value >= range[0] - EPSILON && value <= range[1] + EPSILON;
const near = (value: number, range: Range) => value >= range[0] - WALL_JOINT_MAX_GAP && value <= range[1] + WALL_JOINT_MAX_GAP;

/** The end of `wall` that stops at `other` along `axis`, with the direction from the wall's body to that end. */
function endAt(wall: WallBox, other: WallBox, axis: 'x' | 'z'): { at: number; direction: 1 | -1 } | undefined {
  const own = wall[axis], target = other[axis];
  if (own[0] < target[0] && near(own[1], target)) return { at: own[1], direction: 1 };
  if (own[1] > target[1] && near(own[0], target)) return { at: own[0], direction: -1 };
  return undefined;
}

/** Returns `nodes` followed by fillers that close every open L or T joint between perpendicular wall segments. */
export function closeWallJoints(nodes: readonly SceneNode[]): SceneNode[] {
  const walls = nodes.map(wallBox).filter((value): value is WallBox => !!value);
  const covered = (x: number, z: number, y: Range) => walls.some(wall => inside(x, wall.x) && inside(z, wall.z) && wall.y[0] < y[1] - EPSILON && wall.y[1] > y[0] + EPSILON);
  const fillers: AssetNode[] = [];
  const fill = (id: string, source: WallBox, x: Range, z: Range, y: Range) => fillers.push({
    id, kind: 'asset', asset: 'wall-segment', variant: 'solid', selectable: false,
    position: [(x[0] + x[1]) / 2, y[0], (z[0] + z[1]) / 2],
    scale: [(x[1] - x[0]) / WALL.length, (y[1] - y[0]) / WALL.height, (z[1] - z[0]) / WALL.thickness],
    ...(source.node.color ? { color: source.node.color } : {}), ...(source.node.materials ? { materials: source.node.materials } : {}),
  });
  for (const a of walls) for (const b of walls) {
    if (a.axis !== 'x' || b.axis !== 'z') continue;
    const y: Range = [Math.max(a.y[0], b.y[0]), Math.min(a.y[1], b.y[1])];
    if (y[1] - y[0] < MIN_SHARED_HEIGHT) continue;
    const aEnd = endAt(a, b, 'x'), bEnd = endAt(b, a, 'z'), id = `wall-joint:${a.node.id}:${b.node.id}`;
    if (aEnd && bEnd) {
      // L joint: fill the square between both ends and the outer faces unless another wall already closes it.
      const x = hull(aEnd.at, b.x), z = hull(bEnd.at, a.z);
      const outerX = aEnd.direction > 0 ? x[1] - EPSILON * 5 : x[0] + EPSILON * 5, outerZ = bEnd.direction > 0 ? z[1] - EPSILON * 5 : z[0] + EPSILON * 5;
      if (!covered(outerX, outerZ, y)) fill(id, a.y[1] >= b.y[1] ? a : b, x, z, y);
    } else if (aEnd && b.z[0] <= a.z[0] + EPSILON && b.z[1] >= a.z[1] - EPSILON) {
      // T joint: `a` stops short of the side of `b`, which runs past it; extend `a` to that face.
      const face = aEnd.direction > 0 ? b.x[0] : b.x[1], x: Range = [Math.min(aEnd.at, face), Math.max(aEnd.at, face)];
      if ((face - aEnd.at) * aEnd.direction > MIN_FILLER && !covered((x[0] + x[1]) / 2, (a.z[0] + a.z[1]) / 2, y)) fill(id, a, x, a.z, y);
    } else if (bEnd && a.x[0] <= b.x[0] + EPSILON && a.x[1] >= b.x[1] - EPSILON) {
      const face = bEnd.direction > 0 ? a.z[0] : a.z[1], z: Range = [Math.min(bEnd.at, face), Math.max(bEnd.at, face)];
      if ((face - bEnd.at) * bEnd.direction > MIN_FILLER && !covered((b.x[0] + b.x[1]) / 2, (z[0] + z[1]) / 2, y)) fill(id, b, b.x, z, y);
    }
  }
  return [...nodes, ...fillers];
}
