import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Ajv, type ErrorObject } from 'ajv';
import { createSceneStore, MARKER_ICONS, MARKER_SHAPES, MARKER_SIZES, MARKER_TONES, MATERIAL_ROLES, NODE_VIEWS, SCENE_RULES, SceneValidationError, validateNode, validateScene, type SceneDefinition, type SceneNode, type SceneProblem, type SceneRule } from '@opsorama/core';
import { assetValidator } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { NESTED_KEYS, NODE_KEYS } from '../packages/core/src/validate-scene';
import { generateSceneSchema, SCHEMA_OUTPUTS } from '../scripts/build-scene-schema.mjs';
import { buildingContents, buildingDefinition } from '../apps/site/examples/building-data';
import { datacenterDefinition } from '../apps/site/examples/datacenter-data';
import { domainKitsDefinition } from '../apps/site/examples/domain-kits-data';
import { logisticsDefinition } from '../apps/site/examples/logistics-data';
import { defaultFeaturedMarker, markerSceneNodes } from '../apps/site/examples/marker-data';
import { motionSceneNodes, palletJackNode, robotNodes } from '../apps/site/examples/motion-data';
import { moveModeDefinition } from '../apps/site/examples/move-mode-data';
import { contractNodes, DEFAULT_CONTRACT } from '../apps/site/examples/object-contract-data';
import { siteEnergyDefinition } from '../apps/site/examples/site-energy-data';
import { surfacesDefinition } from '../apps/site/examples/surfaces-data';
import { warehouseObjectsDefinition } from '../apps/site/examples/warehouse-objects-data';
import { definition as vanillaStarter } from '../examples/vanilla/src/scene';
import { definition as reactStarter } from '../examples/vite-react/src/scene';
import { definition as vueStarter } from '../examples/vite-vue/src/scene';
import { definition as nextStarter } from '../examples/next/app/scene';

/**
 * The scene JSON Schema (generated from the core types) and `validateScene` must agree: valid example scenes pass both,
 * broken fixtures fail both, and rules the schema cannot express (unique IDs, parents, attachments, asset factories)
 * are reported by `validateScene` alone.
 */
const committed = readFileSync('packages/core/schema/scene-definition.schema.json', 'utf8');
const schema = JSON.parse(committed) as { definitions: Record<string, { properties?: Record<string, unknown>; enum?: string[]; anyOf?: { enum?: string[] }[] }> };
const validateSchema = new Ajv({ allErrors: true, strict: true, strictTuples: false }).compile(schema);
const schemaErrors = (scene: unknown): ErrorObject[] => validateSchema(scene) ? [] : [...validateSchema.errors ?? []];
const validateAsset = assetValidator(catalogAssets);
const scene = (nodes: readonly unknown[]): SceneDefinition => ({ schemaVersion: 1, nodes: nodes as SceneNode[] });

const examples: Record<string, SceneDefinition> = {
  building: scene([...buildingDefinition.nodes, ...(['workshop', 'office'] as const).flatMap(id => buildingContents(id).map(node => ({ ...node, parentId: id })))]),
  datacenter: datacenterDefinition,
  'domain-kits': domainKitsDefinition,
  logistics: logisticsDefinition,
  marker: scene(markerSceneNodes(defaultFeaturedMarker)),
  motion: scene([...motionSceneNodes, palletJackNode(12), ...robotNodes(0)]),
  'move-mode': moveModeDefinition,
  'object-contract': scene(contractNodes(DEFAULT_CONTRACT)),
  'site-energy': siteEnergyDefinition,
  surfaces: surfacesDefinition,
  'warehouse-objects': warehouseObjectsDefinition,
  'starter vanilla': vanillaStarter,
  'starter vite-react': reactStarter,
  'starter vite-vue': vueStarter,
  'starter next': nextStarter,
};

interface Expected { path: string; rule: SceneRule; fix: RegExp; severity?: SceneProblem['severity'] }
interface Fixture { name: string; input: unknown; expected: Expected[]; options?: Parameters<typeof validateScene>[1] }
const ground = { id: 'floor', kind: 'ground', size: [20, 12] };
const parcel = { id: 'p', kind: 'asset', asset: 'parcel', position: [0, 0, 0] };

/** Broken scenes that the schema rejects as well. Each expectation names the problem's path, rule and part of its fix. */
const broken: Fixture[] = [
  { name: 'not an object', input: [ground], expected: [{ path: '', rule: 'scene-object', fix: /schemaVersion: 1, nodes/ }] },
  { name: 'wrong version and nodes', input: { schemaVersion: 2, nodes: {} }, expected: [{ path: '/schemaVersion', rule: 'schema-version', fix: /Set schemaVersion to 1/ }, { path: '/nodes', rule: 'nodes-array', fix: /array of node objects/ }] },
  { name: 'node not an object', input: scene([ground, 'parcel']), expected: [{ path: '/nodes/1', rule: 'node-object', fix: /object such as/ }] },
  { name: 'missing id and unknown kind', input: scene([{ kind: 'grund', size: [1, 1] }]), expected: [{ path: '/nodes/0/kind', rule: 'node-kind', fix: /Did you mean "ground"/ }, { path: '/nodes/0/id', rule: 'node-id', fix: /unique string id/ }] },
  { name: 'blank id', input: scene([{ ...ground, id: '  ' }]), expected: [{ path: '/nodes/0/id', rule: 'node-id', fix: /nonempty string/ }] },
  { name: 'typo in a key', input: scene([{ ...parcel, positon: [1, 0, 1] }]), expected: [{ path: '/nodes/0/positon', rule: 'unknown-key', severity: 'warning', fix: /Did you mean "position"/ }] },
  { name: 'unknown root key', input: { schemaVersion: 1, nodes: [], settings: { zoom: 2 } }, expected: [{ path: '/settings', rule: 'unknown-key', severity: 'warning', fix: /not stored in the scene definition/ }] },
  { name: 'wrong field types', input: scene([{ ...parcel, entityId: 7, selectable: 'yes', label: 3, localMotion: 1, variant: 2 }]), expected: [{ path: '/nodes/0/entityId', rule: 'field-type', fix: /String\(order.id\)/ }, { path: '/nodes/0/label', rule: 'field-type', fix: /display text/ }, { path: '/nodes/0/selectable', rule: 'field-type', fix: /true or false/ }, { path: '/nodes/0/variant', rule: 'field-type', fix: /variant names/ }, { path: '/nodes/0/localMotion', rule: 'field-type', fix: /true or false/ }] },
  { name: 'enumerated values', input: scene([{ ...parcel, labelMode: 'hover', state: 'alarm', view: 'ajar', countLayout: 'dense' }]), expected: [{ path: '/nodes/0/labelMode', rule: 'allowed-value', fix: /always or active/ }, { path: '/nodes/0/state', rule: 'allowed-value', fix: /normal, busy, warning, critical, inactive/ }, { path: '/nodes/0/view', rule: 'allowed-value', fix: /closed, peek, open/ }, { path: '/nodes/0/countLayout', rule: 'allowed-value', fix: /compact or reserved/ }] },
  { name: 'transforms', input: scene([{ ...parcel, position: [0, 0], rotation: [0, 'a', 0] }]), expected: [{ path: '/nodes/0/position', rule: 'transform', fix: /three finite numbers \(metres\)/ }, { path: '/nodes/0/rotation', rule: 'transform', fix: /radians/ }] },
  { name: 'sizes and footprints', input: scene([{ ...ground, size: [20, 0] }, { id: 'f', kind: 'asset', asset: 'floor', footprint: [4, -1] }]), expected: [{ path: '/nodes/0/size', rule: 'size', fix: /\[width, depth\] in metres/ }, { path: '/nodes/1/footprint', rule: 'footprint', fix: /\[width, depth\] in metres/ }] },
  { name: 'path with one point', input: scene([{ id: 'lane', kind: 'path', points: [[0, 0, 0]] }]), expected: [{ path: '/nodes/0/points', rule: 'path-points', fix: /two or more/ }] },
  { name: 'missing asset name', input: scene([{ id: 'a', kind: 'asset', asset: ' ' }]), expected: [{ path: '/nodes/0/asset', rule: 'asset-name', fix: /registered model/ }] },
  { name: 'options not an object', input: scene([{ ...parcel, options: [1] }]), expected: [{ path: '/nodes/0/options', rule: 'asset-options', fix: /object keyed by option name/ }] },
  { name: 'materials', input: scene([{ ...parcel, materials: { accnt: '#ffffff', trim: 'red' } }]), expected: [{ path: '/nodes/0/materials/accnt', rule: 'materials', fix: /Did you mean "accent"/ }, { path: '/nodes/0/materials/trim', rule: 'materials', fix: /six-digit hex/ }] },
  { name: 'counts', input: scene([{ ...parcel, count: -1, multiplier: 1.5 }]), expected: [{ path: '/nodes/0/count', rule: 'count', fix: /whole number from 0/ }, { path: '/nodes/0/multiplier', rule: 'count', fix: /at least 1/ }] },
  { name: 'interior', input: scene([{ ...ground, interior: 'yes' }]), expected: [{ path: '/nodes/0/interior', rule: 'interior', fix: /true or false/ }] },
  { name: 'marker', input: scene([{ id: 'm', kind: 'marker', label: '', shape: 'star', icon: { paths: ['M0 0"/><script>'] }, pulse: 'yes' }]), expected: [{ path: '/nodes/0/label', rule: 'marker', fix: /1–120 characters/ }, { path: '/nodes/0/shape', rule: 'marker', fix: /pin, circle/ }, { path: '/nodes/0/icon/paths/0', rule: 'marker', fix: /no markup/ }, { path: '/nodes/0/pulse', rule: 'marker', fix: /true or false/ }] },
  { name: 'route', input: scene([{ ...parcel, route: { points: [[0, 0, 0], [4, 0, 0]], speed: 0, stops: [{ index: 5, seconds: 1 }], loop: true, profile: { cornerSpeed: 1 } } }]), expected: [{ path: '/nodes/0/route/speed', rule: 'route', fix: /greater than 0 and at most 30/ }, { path: '/nodes/0/route/stops/0/index', rule: 'route', fix: /from 0 to points.length - 1 \(1\)/ }, { path: '/nodes/0/route/loop', rule: 'route', fix: /Append the first point \[0, 0, 0\]/ }, { path: '/nodes/0/route/profile/cornerSpeed', rule: 'route', fix: /Add acceleration/ }] },
  { name: 'controller', input: scene([{ ...parcel, controller: { kind: '', options: { at: Number.NaN } } }]), expected: [{ path: '/nodes/0/controller/kind', rule: 'controller', fix: /controller in the renderer's registry/ }] },
  { name: 'transfer', input: scene([{ ...parcel, transfer: { seconds: 9, arc: 3 } }]), expected: [{ path: '/nodes/0/transfer/seconds', rule: 'transfer', fix: /0.05 to 5/ }, { path: '/nodes/0/transfer/arc', rule: 'transfer', fix: /0 to 2 metres/ }] },
  { name: 'route on a zone', input: scene([{ id: 'z', kind: 'zone', size: [2, 2], route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } }]), expected: [{ path: '/nodes/0/route', rule: 'motion-owner', fix: /Move the route to an asset node/ }] },
  { name: 'blank parent and attachment', input: scene([{ ...parcel, parentId: '' }, { ...parcel, id: 'q', attachment: { nodeId: 'p', anchor: '' } }]), expected: [{ path: '/nodes/0/parentId', rule: 'parent-id', fix: /id of the containing asset/ }, { path: '/nodes/1/attachment', rule: 'attachment', fix: /carrier's origin/ }] },
];

/** Broken scenes that pass the schema: rules across nodes and the asset factories' own rules. */
const crossNode: Fixture[] = [
  { name: 'duplicate IDs', input: scene([ground, ground]), expected: [{ path: '/nodes/1/id', rule: 'duplicate-id', fix: /already used by \/nodes\/0/ }] },
  { name: 'parent is a ground', input: scene([ground, { ...parcel, parentId: 'floor' }]), expected: [{ path: '/nodes/1/parentId', rule: 'parent-kind', fix: /id of an asset node/ }] },
  { name: 'parent cycle', input: scene([{ ...parcel, id: 'a', parentId: 'b' }, { ...parcel, id: 'b', parentId: 'a' }]), expected: [{ path: '/nodes/0/parentId', rule: 'parent-cycle', fix: /ends at a top-level node/ }, { path: '/nodes/1/parentId', rule: 'parent-cycle', fix: /ends at a top-level node/ }] },
  { name: 'attachment conflicts and cycle', input: scene([{ ...parcel, id: 'a', attachment: { nodeId: 'b' } }, { ...parcel, id: 'b', attachment: { nodeId: 'a' }, parentId: 'a', route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } }]), expected: [{ path: '/nodes/1/attachment', rule: 'attachment-conflict', fix: /remove the other/ }, { path: '/nodes/1/route', rule: 'attachment-conflict', fix: /Give the carrier the route/ }, { path: '/nodes/0/attachment', rule: 'attachment-cycle', fix: /ends at a node that is not carried/ }] },
  { name: 'route and controller together', input: scene([{ ...parcel, route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 }, controller: { kind: 'approach' } }]), expected: [{ path: '/nodes/0/controller', rule: 'motion-owner', fix: /Keep either route/ }] },
  { name: 'asset factory rejects options', options: { validateAsset }, input: scene([{ ...parcel, options: { forks: { height: 1 } } }]), expected: [{ path: '/nodes/0/options', rule: 'asset-validator', fix: /asset factory accepts it/ }] },
  { name: 'unknown asset', options: { validateAsset }, input: scene([{ ...parcel, asset: 'teleporter' }]), expected: [{ path: '/nodes/0', rule: 'asset-validator', fix: /registered asset name/ }] },
  { name: 'non-JSON option values', input: scene([{ ...parcel, options: { reading: { value: Number.POSITIVE_INFINITY } } }]), expected: [{ path: '/nodes/0/options/reading/value', rule: 'asset-options', fix: /plain data/ }] },
];

/** Resolves a JSON Pointer in `value`; undefined when a step is missing. */
function resolve(value: unknown, path: string): unknown {
  return path.split('/').slice(1).map(token => token.replace(/~1/g, '/').replace(/~0/g, '~')).reduce<unknown>((current, token) => current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[token] : undefined, value);
}

describe('scene JSON Schema', () => {
  it('matches the core types: run pnpm schema:generate after changing them', () => {
    const generated = generateSceneSchema();
    for (const output of SCHEMA_OUTPUTS) expect(readFileSync(output, 'utf8').replace(/\r\n/g, '\n') === generated, `${output} is out of date: run pnpm schema:generate`).toBe(true);
  }, 60_000);

  it('is published by @opsorama/core', () => {
    const manifest = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
    expect(manifest.exports['./scene-definition.schema.json']).toBe('./schema/scene-definition.schema.json');
    expect(manifest.publishConfig.exports['./scene-definition.schema.json']).toBe('./schema/scene-definition.schema.json');
    expect(manifest.files).toContain('schema');
  });

  it('declares the same keys that validateScene knows, so unknown-key warnings agree with the schema', () => {
    const properties = (name: string) => Object.keys(schema.definitions[name].properties ?? {}).sort();
    for (const [kind, keys] of Object.entries(NODE_KEYS)) expect([...keys].sort(), kind).toEqual(properties(`${kind.charAt(0).toUpperCase()}${kind.slice(1)}Node`));
    for (const [name, keys] of Object.entries(NESTED_KEYS)) expect([...keys].sort(), name).toEqual(properties(name));
    expect(Object.keys(schema.definitions.MaterialOverrides.properties!).sort()).toEqual([...MATERIAL_ROLES].sort());
    expect(schema.definitions.NodeView.enum).toEqual([...NODE_VIEWS]);
    expect(schema.definitions.MarkerShape.enum).toEqual([...MARKER_SHAPES]);
    expect(schema.definitions.MarkerTone.enum).toEqual([...MARKER_TONES]);
    expect(schema.definitions.MarkerIconName.enum).toEqual([...MARKER_ICONS]);
    expect(schema.definitions.MarkerSize.enum).toEqual(Object.keys(MARKER_SIZES));
    // Every value the schema allows for an enumerated node field is accepted by validateScene.
    for (const state of schema.definitions.VisualState.enum!) expect(validateScene(scene([{ ...parcel, state }])), state).toEqual([]);
    for (const countLayout of schema.definitions.CountLayout.enum!) expect(validateScene(scene([{ ...parcel, countLayout }])), countLayout).toEqual([]);
  });
});

describe('validateScene', () => {
  it.each(Object.entries(examples))('accepts the %s example with the schema and the catalog factories', (_, definition) => {
    expect(schemaErrors(definition)).toEqual([]);
    expect(validateScene(definition, { validateAsset })).toEqual([]);
  });

  it.each(broken.map(fixture => [fixture.name, fixture] as const))('rejects %s with the schema and reports each problem', (_, fixture) => {
    expect(schemaErrors(fixture.input).length).toBeGreaterThan(0);
    const problems = validateScene(fixture.input, fixture.options);
    for (const expected of fixture.expected) {
      const problem = problems.find(candidate => candidate.path === expected.path && candidate.rule === expected.rule);
      expect(problem, `${expected.rule} at ${expected.path} in ${JSON.stringify(problems.map(item => [item.path, item.rule]))}`).toBeDefined();
      expect(problem!.fix).toMatch(expected.fix);
      expect(problem!.severity).toBe(expected.severity ?? 'error');
    }
  });

  it.each(crossNode.map(fixture => [fixture.name, fixture] as const))('reports %s, which the schema cannot express', (_, fixture) => {
    expect(schemaErrors(fixture.input)).toEqual([]);
    const problems = validateScene(fixture.input, fixture.options);
    for (const expected of fixture.expected) {
      const problem = problems.find(candidate => candidate.path === expected.path && candidate.rule === expected.rule);
      expect(problem, `${expected.rule} at ${expected.path} in ${JSON.stringify(problems.map(item => [item.path, item.rule]))}`).toBeDefined();
      expect(problem!.fix).toMatch(expected.fix);
    }
  });

  it('exercises every rule, with a message, a fix, a node ID and a path into the input', () => {
    const seen = new Set<SceneRule>();
    for (const fixture of [...broken, ...crossNode]) for (const problem of validateScene(fixture.input, fixture.options)) {
      seen.add(problem.rule);
      expect(SCENE_RULES[problem.rule], problem.rule).toBeTruthy();
      expect(problem.message.length, fixture.name).toBeGreaterThan(10);
      expect(problem.fix.length, fixture.name).toBeGreaterThan(10);
      expect(problem.severity).toBe(problem.rule === 'unknown-key' ? 'warning' : 'error');
      // The path points into the input: its parent exists, and the value itself exists unless a field is missing.
      if (problem.path) expect(resolve(fixture.input, problem.path.replace(/\/[^/]*$/, '')), `${fixture.name}: ${problem.path}`).toBeDefined();
      const node = /^\/nodes\/(\d+)/.exec(problem.path);
      const id = node && resolve(fixture.input, `/nodes/${node[1]}/id`);
      if (typeof id === 'string') expect(problem.nodeId, `${fixture.name}: ${problem.path}`).toBe(id);
    }
    expect([...seen].sort()).toEqual(Object.keys(SCENE_RULES).sort());
  });

  it('reports every problem in one pass and never throws on malformed input', () => {
    for (const input of [undefined, null, 1, 'scene', { nodes: null }, { schemaVersion: 1, nodes: [null, [], 3, { id: 4, kind: {} }] }]) expect(() => validateScene(input)).not.toThrow();
    const problems = validateScene(scene([{ ...parcel, position: [0, 0], count: -1 }, { id: 'lane', kind: 'path', points: [] }]));
    expect(problems.map(problem => problem.path)).toEqual(['/nodes/0/position', '/nodes/0/count', '/nodes/1/points']);
  });

  it('runs asset factories only on otherwise valid asset nodes', () => {
    const calls: string[] = [];
    validateScene(scene([{ ...parcel, position: [0] }, { ...parcel, id: 'ok' }]), { validateAsset: node => { calls.push(node.id); } });
    expect(calls).toEqual(['ok']);
  });
});

describe('throwing validators', () => {
  it('throw SceneValidationError with every problem and the first error as message', () => {
    const store = createSceneStore();
    let error: unknown;
    try { store.replace(scene([{ ...parcel, positon: [0, 0, 0], count: -1 }, { ...parcel, size: [1, 1], state: 'alarm' }]).nodes); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(SceneValidationError);
    const { problems, message } = error as SceneValidationError;
    expect(message).toBe('Asset count must be a non-negative safe integer.');
    expect(problems.map(problem => [problem.path, problem.rule, problem.severity])).toEqual([
      ['/nodes/0/count', 'count', 'error'], ['/nodes/0/positon', 'unknown-key', 'warning'], ['/nodes/1/state', 'allowed-value', 'error'], ['/nodes/1/size', 'unknown-key', 'warning'], ['/nodes/1/id', 'duplicate-id', 'error'],
    ]);
    expect(() => store.upsert({ ...parcel, rotation: [0, NaN, 0] } as unknown as SceneNode)).toThrow(expect.objectContaining({ name: 'SceneValidationError', problems: [expect.objectContaining({ path: '/nodes/0/rotation', rule: 'transform', nodeId: 'p' })] }));
    expect(() => validateNode({ ...parcel, route: { points: [], speed: 1 } } as unknown as SceneNode)).toThrow(expect.objectContaining({ problems: [expect.objectContaining({ path: '/route/points', rule: 'route' })] }));
  });

  it('accept warnings: unknown keys never block the store', () => {
    const store = createSceneStore(scene([{ ...parcel, colour: '#ff0000' }]));
    expect(store.getSnapshot().nodes).toHaveLength(1);
    expect(() => createSceneStore({ schemaVersion: 1 } as unknown as SceneDefinition)).toThrow(/nodes must be an array/);
    expect(() => createSceneStore({ schemaVersion: 2, nodes: [] } as unknown as SceneDefinition)).toThrow(/Unsupported scene schema version: 2/);
  });
});
