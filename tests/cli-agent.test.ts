import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogEntries, checkScene, describeAsset, docTopics, findDocTopic, formatAsset, formatEntries, formatTopics, installSkill, run, searchCatalog, skillText } from '@opsorama/cli';
import { catalogAssets, catalogKitAssets, CATALOG_KITS } from '@opsorama/objects';
import { vehiclesKit } from '@opsorama/objects/vehicles';
import { writeAgentData } from '../scripts/lib/agent-data.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-cli-agent-'));
const agent = path.join(dir, 'agent');
beforeAll(async () => { await writeAgentData(agent); }, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('catalog commands', () => {
  it('know the kit of every catalog model', () => {
    expect(Object.keys(catalogKitAssets)).toEqual([...CATALOG_KITS]);
    expect(catalogKitAssets.vehicles).toEqual(Object.keys(vehiclesKit));
    expect(Object.values(catalogKitAssets).flat().sort()).toEqual(Object.keys(catalogAssets).sort());
    const entries = catalogEntries();
    expect(entries).toHaveLength(Object.keys(catalogAssets).length);
    expect(entries.find(entry => entry.asset === 'forklift')).toEqual({ asset: 'forklift', name: 'Forklift', category: 'Vehicles', purpose: expect.any(String), kit: 'vehicles', import: '@opsorama/objects/vehicles', export: 'vehiclesKit' });
    expect(entries.find(entry => entry.asset === 'pallet-rack')).toMatchObject({ export: expect.stringMatching(/^[a-z][A-Za-z]*Kit$/) });
  });

  it('search by every word, best match first, within a kit and with a limit', () => {
    expect(searchCatalog('forklift')[0].asset).toBe('forklift');
    expect(searchCatalog('pallet truck').map(entry => entry.asset)).toContain('pallet-jack');
    expect(searchCatalog('pallet truck').every(entry => `${entry.asset} ${entry.name} ${entry.purpose} ${entry.category} ${entry.kit}`.toLowerCase().includes('truck'))).toBe(true);
    expect(searchCatalog('tree', { kit: 'environment' }).every(entry => entry.kit === 'environment')).toBe(true);
    expect(searchCatalog('', { limit: 500 })).toHaveLength(Object.keys(catalogAssets).length);
    expect(searchCatalog('', { limit: 3 })).toHaveLength(3);
    expect(searchCatalog('zzzz qqqq')).toEqual([]);
    expect(formatEntries([])).toContain('No catalog model matches');
    expect(() => searchCatalog('x', { kit: 'spaceships' })).toThrow('Unknown kit: spaceships. Kits: datacenter');
  });

  it('show one model with its import, fields, anchors and an example node that passes the check', () => {
    const forklift = describeAsset('forklift');
    expect(forklift).toMatchObject({ kit: 'vehicles', import: '@opsorama/objects/vehicles', docs: 'https://opsorama.dev/docs/objects/forklift', example: { kind: 'asset', asset: 'forklift' } });
    for (const asset of Object.keys(catalogAssets)) expect(checkScene({ schemaVersion: 1, nodes: [describeAsset(asset).example] }), asset).toEqual([]);
    const text = formatAsset(forklift);
    for (const part of ["Import: import { vehiclesKit } from '@opsorama/objects/vehicles';", 'Size: 1.3 × 2.37 × 2.94 m', 'variant: ', 'Anchors (AssetNode.attachment.anchor):', '  load: ', 'Palette roles', 'Example node:', 'opsorama docs objects/forklift']) expect(text).toContain(part);
    expect(formatAsset(describeAsset('shelf'))).toContain('Interaction slots: pick-0, pick-1');
    expect(() => describeAsset('forklif')).toThrow('Unknown catalog asset: forklif. Did you mean forklift?');
    expect(() => describeAsset('zzzzzzzz')).toThrow(/^Unknown catalog asset: zzzzzzzz\. Find/);
  });
});

describe('documentation and skill commands', () => {
  it('ship every documentation page as Markdown and find pages by path, last segment or title', () => {
    const topics = docTopics(agent);
    for (const topic of ['introduction', 'quickstart', 'validation', 'camera', 'api/cli', 'objects/forklift', 'components/shape']) expect(topics.map(item => item.topic)).toContain(topic);
    expect(findDocTopic('cli', topics).markdown).toMatch(/^## Command line\n\nSource: https:\/\/opsorama\.dev\/docs\/api\/cli\n/);
    expect(findDocTopic('/docs/camera', topics).topic).toBe('camera');
    expect(findDocTopic('Scene validation', topics).topic).toBe('validation');
    expect(() => findDocTopic('objects/forkl', topics)).toThrow('Similar topics: objects/forklift');
    expect(() => findDocTopic('kamera', topics)).toThrow('No documentation topic kamera. List the topics with: opsorama docs');
    const list = formatTopics(topics);
    expect(list.indexOf('Getting started')).toBeLessThan(list.indexOf('Foundations')); expect(list.indexOf('Foundations')).toBeLessThan(list.indexOf('API reference'));
    expect(list).toContain('  api/cli: Command line.'); expect(list).not.toContain('  objects/forklift');
    expect(list).toMatch(/Objects: \d+ pages, one per catalog model/);
  });

  it('install the skill, keep it up to date and protect local edits', () => {
    const target = path.join(dir, 'project', '.claude', 'skills'), file = path.join(target, 'opsorama', 'SKILL.md');
    expect(skillText(agent)).toBe(fs.readFileSync('skills/opsorama/SKILL.md', 'utf8'));
    expect(installSkill({ target, directory: agent })).toEqual({ file, status: 'created' });
    expect(installSkill({ target, directory: agent }).status).toBe('unchanged');
    // A newer package version replaces a copy nobody edited.
    const newer = path.join(dir, 'newer'); fs.mkdirSync(newer); fs.writeFileSync(path.join(newer, 'SKILL.md'), `${skillText(agent)}\nNew step.\n`);
    expect(installSkill({ target, directory: newer }).status).toBe('updated');
    expect(fs.readFileSync(file, 'utf8')).toContain('New step.');
    // Local edits are replaced only with force.
    fs.appendFileSync(file, '\nLocal rule.\n');
    expect(() => installSkill({ target, directory: agent })).toThrow('has local edits or was not installed by opsorama skill. Run again with --force');
    expect(installSkill({ target, directory: agent, force: true }).status).toBe('updated');
    expect(fs.readFileSync(file, 'utf8')).toBe(skillText(agent));
    expect(() => docTopics(path.join(dir, 'missing'))).toThrow('docs.json is missing');
  });

  it('run as commands with text and JSON output', async () => {
    const search = await run(['catalog', 'search', 'forklift', '--json']);
    expect(search.code).toBe(0); expect(JSON.parse(search.stdout)[0]).toMatchObject({ asset: 'forklift', import: '@opsorama/objects/vehicles' });
    expect(JSON.parse((await run(['catalog', 'show', 'forklift', '--json'])).stdout)).toMatchObject({ asset: 'forklift', descriptor: { name: 'Forklift' }, example: { asset: 'forklift' } });
    expect((await run(['catalog', 'show', 'forklif'])).stderr).toContain('Did you mean forklift?');
    expect((await run(['catalog', 'list'])).code).toBe(2);
    expect((await run(['catalog', 'search', '--limit', '2'])).stdout.split('\n')).toHaveLength(2);
    expect((await run(['docs', 'camera'], { agentDirectory: agent })).stdout).toMatch(/^## Camera/);
    expect(JSON.parse((await run(['docs', '--json'], { agentDirectory: agent })).stdout)[0]).toEqual({ topic: expect.any(String), title: expect.any(String), category: expect.any(String), description: expect.any(String) });
    expect((await run(['skill', '--print'], { agentDirectory: agent })).stdout).toBe(skillText(agent));
    const target = path.join(dir, 'command-skills');
    expect((await run(['skill', '--dir', target], { agentDirectory: agent })).stdout).toBe(`Installed: ${path.join(target, 'opsorama', 'SKILL.md')}`);
    expect((await run(['skill', 'extra'], { agentDirectory: agent })).code).toBe(2);
  });
});
