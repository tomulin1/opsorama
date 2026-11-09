import { createSceneStore, type AssetNode, type NodeRoute, type SceneNode, type SceneStore, type Vec3, type VisualState } from '@opsorama/core';
import { FIELDS, PENS, SCENARIOS, SPECIES, STAGE_LABELS, fieldRecord, flagsOf, penRecord, penState, troughState, type FarmScenario, type FarmSnapshot, type FlagSeverity, type Pen, type PenId } from './model';

const p = (x: number, z: number, y = 0): Vec3 => [x, y, z];
const yaw = (value: number): Vec3 => [0, value, 0];
const HALF = Math.PI / 2;
const fixture = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });
const selectable = (id: string, entityId: string, asset: string, position: Vec3, label: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, entityId, kind: 'asset', asset, position, label, labelMode: 'active', selectable: true, ...extra });
/** Deterministic sequence, so a snapshot always places the same animals in the same spots. */
function seeded(seed: number): () => number { let value = seed; return () => (value = value * 16807 % 2147483647) / 2147483647; }

/* ── Fixed layout ───────────────────────────────────────────────────────── */

export const BARN_AT = p(-8, -14), SILO_AT = { S1: p(2, -16), S2: p(8, -16) } as const, COOP_AT = p(-27.5, -1.6);
/** Where each pen's status pin stands, just outside its gate side. */
const PIN_AT: Readonly<Record<PenId, Vec3>> = { horses: p(-18.6, -19), dairy: p(12.6, -19), sheep: p(12.6, 7.5), pigs: p(-3.6, 4.2), hens: p(-21.6, 2.2) };

/** Paddock fence segments around a pen; one segment on the gate side is a closed gate. */
function fence(pen: Pen): AssetNode[] {
  const [x0, x1, z0, z1] = pen.rect, nodes: AssetNode[] = [];
  const side = (name: Pen['gate']['side'], from: Vec3, to: Vec3, heading: number) => {
    const count = Math.round(Math.hypot(to[0] - from[0], to[2] - from[2]) / 3);
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, gate = pen.gate.side === name && pen.gate.segment === i;
      nodes.push(fixture(`fence:${pen.id}:${name}:${i}`, 'paddock-fence', p(from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t), { rotation: yaw(heading), ...(gate ? { variant: 'gate' } : {}) }));
    }
  };
  // Rails face into the pen (+z of each segment points inward), so gates swing inward.
  side('north', p(x0, z0), p(x1, z0), 0); side('south', p(x1, z1), p(x0, z1), Math.PI);
  side('west', p(x0, z1), p(x0, z0), HALF); side('east', p(x1, z0), p(x1, z1), -HALF);
  return nodes;
}

/** Animal spots in a pen: a jittered grid clear of the fence and the trough. */
function spots(pen: Pen, count: number): { at: Vec3; heading: number; lying: boolean }[] {
  const [x0, x1, z0, z1] = pen.rect, random = seeded(pen.id.length * 97 + pen.rect[0] * 13 + 7), margin = pen.species === 'chicken' ? 1 : 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (x1 - x0) / (z1 - z0)))), rows = Math.ceil(count / columns), result: { at: Vec3; heading: number; lying: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % columns, r = Math.floor(i / columns), jx = (random() - .5) * .6, jz = (random() - .5) * .6;
    const x = x0 + margin + (x1 - x0 - 2 * margin) * (columns === 1 ? .5 : (c + .5 + jx) / columns), z = z0 + margin + (z1 - z0 - 2 * margin) * ((r + .5 + jz) / rows);
    result.push({ at: p(x, z), heading: random() * Math.PI * 2, lying: pen.species !== 'horse' && random() < .3 });
  }
  return result;
}
const FLAG_STATE: Readonly<Record<FlagSeverity, VisualState>> = { busy: 'busy', warning: 'warning', critical: 'critical' };

const loop = (points: readonly Vec3[], speed: number, elapsed = 0): NodeRoute => ({ points: [...points, points[0]], speed, loop: true, elapsed });
/** The dog patrols the yard; the farmer walks between the barn, the pig pen and the paddock gates. */
const DOG_ROUTE = loop([p(0, -3), p(9, -3), p(9, 9), p(0, 9)], 1.6);
const FARMER_ROUTE = loop([p(-8, -5.5), p(-3, -3.6), p(11.5, -3.6), p(11.5, 7), p(-3, 7)], 1.1, 6);
/** Two small birds circle over the fields, 5–7 m up. */
const BIRD_ROUTES = [loop([p(-28, 16, 6), p(-17, 15, 6.6), p(-15, 21, 7), p(-27, 22, 6.3)], 4), loop([p(16, 15, 5.4), p(29, 16, 6), p(28, 22, 6.8), p(17, 21, 5.8)], 4.4, 3)];
const TRACTOR_ROUTE = loop([p(-7, 15), p(8, 15), p(8, 18), p(-7, 18), p(-7, 21), p(8, 21)], 2.2);

/** Ground, yard surfaces, buildings and storage that do not depend on the snapshot. */
export const farmBase: readonly SceneNode[] = [
  { id: 'ground', kind: 'ground', size: [72, 52], position: [0, 0, 0], color: '#cfdcc0' },
  ...PENS.map(pen => fixture(`grass:${pen.id}`, 'terrain', p((pen.rect[0] + pen.rect[1]) / 2, (pen.rect[2] + pen.rect[3]) / 2), { variant: pen.species === 'pig' || pen.species === 'chicken' ? 'gravel' : 'grass', footprint: [pen.rect[1] - pen.rect[0], pen.rect[3] - pen.rect[2]] })),
  fixture('yard', 'terrain', p(0, -5), { variant: 'gravel', footprint: [24, 8] }),
  fixture('lane', 'terrain', p(0, 10.5), { variant: 'gravel', footprint: [66, 3] }),
  // Hay store beside the barn and trees along the north boundary.
  // Two square bales with two more stacked on top (0.9 m high each).
  ...([[-12, 0], [-9.5, 0], [-12, .9], [-9.5, .9]] as const).map(([z, y], i) => fixture(`bale:square:${i}`, 'hay-bale', p(-16.6, z, y), { variant: 'square' })),
  ...[0, 1, 2].map(i => fixture(`bale:round:${i}`, 'hay-bale', p(-16.4, -17.5 + i * 1.6), { variant: 'round', rotation: yaw(HALF) })),
  ...[-30, -24, -1, 4, 12, 22, 30].map((x, i) => fixture(`tree:${i}`, i % 2 ? 'tree-pine' : 'tree', p(x, -24.5 + (i % 3) * .6))),
];

/* ── Snapshot-dependent nodes ───────────────────────────────────────────── */

export function farmNodes(snapshot: FarmSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [...farmBase];

  // Buildings and silos. Labels carry the record; the model encodes no stock.
  nodes.push(selectable('barn', 'barn', 'barn', BARN_AT, `Barn · ${snapshot.barn.bales} bales`, { variant: snapshot.barn.open ? 'open' : 'closed' }));
  for (const silo of snapshot.silos) nodes.push(selectable(`silo:${silo.id}`, silo.id, 'grain-silo', SILO_AT[silo.id], `Silo ${silo.id} · ${silo.grain} ${silo.fill} %`, { rotation: yaw(Math.PI) }));
  nodes.push(selectable('coop', 'coop', 'chicken-coop', COOP_AT, `Hen house · ${snapshot.coop.eggs} eggs`, { variant: snapshot.coop.open ? 'open' : 'closed' }));

  // Pens: fence, status pin, trough and up to `shown` animals; flagged animals come first with separate host alert markers.
  // Every drawn animal is selectable: a flagged one opens its flag, the others stand for the herd and open their pen.
  for (const pen of PENS) {
    const record = penRecord(snapshot, pen.id), flags = flagsOf(snapshot, pen.id), state = penState(snapshot, pen.id);
    nodes.push(...fence(pen));
    nodes.push({ id: `pin:${pen.id}`, entityId: pen.id, kind: 'asset', asset: 'map-pin', position: PIN_AT[pen.id], color: '#4f7f3a', ...(state !== 'normal' ? { state } : {}), label: `${pen.label} · ${record.headcount}${record.headcount < record.expected ? ` of ${record.expected}` : ''}`, labelMode: 'always', selectable: true });
    nodes.push(selectable(`trough:${pen.id}`, pen.id, 'trough', p(pen.trough.at[0], pen.trough.at[1]), `${pen.label} ${pen.trough.variant} · ${record.level} %`, { variant: pen.trough.variant, rotation: yaw(pen.trough.yaw), fillLevel: record.level / 100, state: troughState(record.level) }));
    // A missing animal is not drawn; its flag points at the pen instead.
    const present = flags.filter(flag => !flag.missing), shown = Math.min(record.headcount, pen.shown), places = spots(pen, shown), asset = pen.species;
    places.forEach((spot, i) => {
      const flag = present[i];
      if (flag) {
        nodes.push(selectable(`animal:${flag.tag}`, flag.tag, asset, spot.at, `${SPECIES[pen.species].label} ${flag.tag} · ${flag.issue}`, { rotation: yaw(spot.heading), state: FLAG_STATE[flag.severity], variant: flag.severity === 'critical' && pen.species !== 'sheep' ? 'lying' : 'standing' }));
        nodes.push({ id: `animal-alert:${flag.tag}`, entityId: flag.tag, kind: 'asset', asset: 'map-pin', attachment: { nodeId: `animal:${flag.tag}`, anchor: 'top' }, position: [0, .08, 0], scale: [.3, .3, .3], state: FLAG_STATE[flag.severity], localMotion: false, selectable: true });
      } else nodes.push(selectable(`animal:${pen.id}:${i}`, pen.id, asset, spot.at, `${SPECIES[pen.species].label} · ${pen.label}`, { rotation: yaw(spot.heading), variant: spot.lying ? 'lying' : 'standing' }));
    });
  }

  // Fields: one sized node per field; the stage comes from the field record.
  for (const value of FIELDS) {
    const [x0, x1, z0, z1] = value.rect, record = fieldRecord(snapshot, value.id);
    nodes.push(selectable(`field:${value.id}`, value.id, 'crop-field', p((x0 + x1) / 2, (z0 + z1) / 2), `${value.name} · ${STAGE_LABELS[record.stage]}`, { variant: record.stage, footprint: [x1 - x0, z1 - z0] }));
  }

  // Tractor: parked in the yard, by the barn for service, or working its field route.
  const tractor = snapshot.tractor, label = `Tractor · ${tractor.status === 'working' ? `working ${tractor.field}` : tractor.status}`;
  if (tractor.status === 'working') nodes.push({ ...selectable('tractor', 'tractor', 'tractor', TRACTOR_ROUTE.points[0], label), route: TRACTOR_ROUTE });
  else nodes.push(selectable('tractor', 'tractor', 'tractor', tractor.status === 'service' ? p(1, -6.2) : p(4, -5), label, { rotation: yaw(tractor.status === 'service' ? -HALF : HALF) }));

  // Moving life: the yard dog, a farmer on the chores round and two birds over the fields. The animals are selectable; the farmer stays scenery.
  nodes.push({ ...selectable('dog', 'dog', 'dog', DOG_ROUTE.points[0], 'Yard dog', { variant: 'walking' }), route: DOG_ROUTE });
  nodes.push({ ...fixture('farmer', 'worker', FARMER_ROUTE.points[0], { variant: 'walking', color: '#4f7f3a' }), route: FARMER_ROUTE });
  BIRD_ROUTES.forEach((route, i) => nodes.push({ ...selectable(`bird:${i}`, `bird:${i}`, 'bird', route.points[0], 'Small bird'), route }));
  nodes.push(selectable('cat', 'cat', 'cat', p(-2.6, -6.6), 'Farm cat', { variant: 'lying', rotation: yaw(.4) }));
  return nodes;
}

export const DEFAULT_ZOOM = 1.2;
export function createFarmStore(scenario: FarmScenario = 'heat'): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: farmNodes(SCENARIOS[scenario]) }, { zoom: DEFAULT_ZOOM });
}
/** Replace with a confirmed host snapshot. Nothing in the UI changes herd, level or task records optimistically. */
export function applyFarmSnapshot(store: SceneStore, snapshot: FarmSnapshot): void { store.replace(farmNodes(snapshot)); }
