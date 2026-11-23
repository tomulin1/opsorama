import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkScene, checkSceneFile, formatReport, loadAssetModule, reportPassed, run, sceneRegistry } from '@opsorama/cli';
import { catalogAssets } from '@opsorama/objects';
import { assetValidator } from '@opsorama/three';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-cli-test-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, content: unknown) => { const file = path.join(dir, name); fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content)); return file; };

const valid = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [12, 8] },
  { id: 'lift', kind: 'asset', asset: 'forklift', position: [0, 0, 0] },
  { id: 'bar', kind: 'shape', shape: { type: 'box', size: [1, 2, 1] }, position: [2, 0, 0] },
] };
const invalid = { schemaVersion: 1, nodes: [
  { id: 'lift', kind: 'asset', asset: 'forklif' },
  { id: 'bar', kind: 'shape', shape: { type: 'box', size: [1, 1, 1] }, colour: '#ff0000' },
] };
const customModule = write('assets.ts', [
  `import * as THREE from 'three';`,
  `import type { AssetNode } from '@opsorama/core';`,
  `const beacon = (node: AssetNode) => new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), new THREE.MeshStandardMaterial({ color: '#e0442f' }));`,
  `beacon.validate = (node: AssetNode) => { if (node.options) throw new Error('Asset beacon does not accept options.'); };`,
  `export default { beacon };`,
].join('\n'));

describe('checking scenes', () => {
  it('suggests the closest registered asset name for an unknown asset', () => {
    expect(() => assetValidator(catalogAssets)({ id: 'x', kind: 'asset', asset: 'forklif' })).toThrow('Unknown asset: forklif. Did you mean forklift?');
    expect(() => assetValidator(catalogAssets)({ id: 'x', kind: 'asset', asset: 'zzzzzzzz' })).toThrow(/^Unknown asset: zzzzzzzz\. Add its/);
  });

  it('reports scene rules and catalog problems with paths, rules and fixes', () => {
    expect(checkScene(valid)).toEqual([]);
    const problems = checkScene(invalid);
    expect(problems.map(({ path, rule, severity, nodeId }) => ({ path, rule, severity, nodeId }))).toEqual([
      { path: '/nodes/0', rule: 'asset-validator', severity: 'error', nodeId: 'lift' },
      { path: '/nodes/1/colour', rule: 'unknown-key', severity: 'warning', nodeId: 'bar' },
    ]);
    expect(problems[0].message).toContain('Did you mean forklift?');
  });

  it('reads files, reports unreadable or invalid JSON and formats a report', () => {
    const report = checkSceneFile(write('invalid.json', invalid));
    expect(reportPassed(report)).toBe(false);
    expect(formatReport(report)).toMatch(/invalid\.json: 1 error, 1 warning\n {2}error {3}\/nodes\/0 {2}\[asset-validator\] {2}node lift\n/);
    expect(formatReport(report)).toContain('Fix: Did you mean "color"?');
    const warningsOnly = checkSceneFile(write('warning.json', { schemaVersion: 1, nodes: [invalid.nodes[1]] }));
    expect([reportPassed(warningsOnly), reportPassed(warningsOnly, true)]).toEqual([true, false]);
    expect(formatReport(checkSceneFile(write('valid.json', valid)))).toMatch(/valid\.json: ok$/);
    expect(checkSceneFile(write('broken.json', '{ "schemaVersion": 1, ')).error).toMatch(/^Not valid JSON: .*SceneDefinition object/);
    expect(checkSceneFile(write('bom.json', `﻿${JSON.stringify(valid)}`)).problems).toEqual([]);
    expect(checkSceneFile(path.join(dir, 'missing.json')).error).toMatch(/^Cannot read the file/);
  });

  it('loads a TypeScript asset module that imports three.js and the core types', async () => {
    const registry = await loadAssetModule(customModule);
    expect(Object.keys(registry)).toEqual(['beacon']);
    const merged = sceneRegistry(registry);
    expect(merged.beacon).toBe(registry.beacon); expect(merged.forklift).toBe(catalogAssets.forklift);
    const scene = { schemaVersion: 1, nodes: [{ id: 'b', kind: 'asset', asset: 'beacon', options: { blink: true } }] };
    expect(checkScene(scene, merged)[0]).toMatchObject({ path: '/nodes/0/options', rule: 'asset-validator', message: 'Asset beacon does not accept options.' });
    expect(checkScene({ schemaVersion: 1, nodes: [{ id: 'b', kind: 'asset', asset: 'beacon' }] }, merged)).toEqual([]);
  });

  it('rejects asset modules without a registry, with non-functions or with catalog names', async () => {
    await expect(loadAssetModule(write('none.js', 'export const x = 1;'))).rejects.toThrow('exports no asset registry');
    await expect(loadAssetModule(write('bad.js', 'export const assets = { beacon: 1 };'))).rejects.toThrow('asset beacon is not a factory function');
    await expect(loadAssetModule(path.join(dir, 'nope.js'))).rejects.toThrow('Asset module not found');
    await expect(loadAssetModule(write('syntax.js', 'export default {'))).rejects.toThrow('Could not bundle the asset module');
    const duplicate = await loadAssetModule(write('dup.js', 'export default { parcel: () => null };'));
    expect(() => sceneRegistry(duplicate)).toThrow('Asset parcel is registered twice');
  });
});

describe('opsorama command', () => {
  it('checks files and exits 0, 1 or 2', async () => {
    const good = write('good.json', valid), bad = write('bad.json', invalid);
    expect(await run(['check', good])).toEqual({ code: 0, stdout: `${good}: ok`, stderr: '' });
    const failed = await run(['check', good, bad]);
    expect(failed.code).toBe(1); expect(failed.stdout).toContain(`${bad}: 1 error, 1 warning`);
    const json = await run(['check', bad, '--json']);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, files: [{ file: bad, ok: false, problems: [{ rule: 'asset-validator' }, { rule: 'unknown-key' }] }] });
    expect((await run(['check'])).code).toBe(2);
    expect(await run(['lint', good])).toMatchObject({ code: 2, stderr: 'opsorama: Unknown command: lint. Use check or render; opsorama --help lists the options.' });
    expect((await run(['check', good, '--nope'])).code).toBe(2);
  });

  it('checks with an asset module, prints help and the version', async () => {
    const scene = write('custom.json', { schemaVersion: 1, nodes: [{ id: 'b', kind: 'asset', asset: 'beacon' }] });
    expect((await run(['check', scene])).code).toBe(1);
    expect((await run(['check', scene, '--assets', customModule])).code).toBe(0);
    const help = await run(['--help']);
    expect(help.code).toBe(0); expect(help.stdout).toContain('render <scene.json>');
    expect((await run([])).code).toBe(2);
    expect((await run(['--version'])).stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('stops render before starting a browser when the scene or the options are invalid', async () => {
    const bad = write('render-bad.json', invalid);
    const result = await run(['render', bad, '--json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, out: null, errors: [], problems: [{ rule: 'asset-validator' }, { rule: 'unknown-key' }] });
    expect(fs.existsSync(bad.replace(/\.json$/, '.png'))).toBe(false);
    const good = write('render-good.json', valid);
    expect(await run(['render', good, '--width', '8'])).toMatchObject({ code: 2, stderr: 'opsorama: width must be a whole number of pixels from 16 to 4096; received 8.' });
    expect((await run(['render', good, '--settings', write('settings.json', { zoom: 99 })])).code).toBe(2);
    expect((await run(['render', good, '--css', path.join(dir, 'missing.css')])).stderr).toContain('Cannot read the stylesheet');
    expect((await run(['render', good, bad])).code).toBe(2);
  });
});
