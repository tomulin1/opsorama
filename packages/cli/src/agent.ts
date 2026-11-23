import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cliDirectory } from './assets';

/** One documentation page as shipped in the package: the same Markdown as the website's llms-full.txt. */
export interface DocTopic { topic: string; title: string; category: string; description: string; markdown: string }

/** Where the package keeps its documentation pages and agent skill (`dist/agent` when installed). */
export const defaultAgentDirectory = () => path.join(cliDirectory, 'agent');

function agentFile(directory: string, name: string): string {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`${name} is missing from ${directory}. In the Opsorama repository, run the command with pnpm opsorama or build it with pnpm build:packages cli.`);
  return file;
}

/** Every documentation page, in website order. */
export function docTopics(directory = defaultAgentDirectory()): DocTopic[] {
  return (JSON.parse(fs.readFileSync(agentFile(directory, 'docs.json'), 'utf8')) as { topics: DocTopic[] }).topics;
}

/**
 * Finds one page by its topic (the website path after /docs/, such as `camera`, `api/cli` or `objects/forklift`), by the
 * last part of it (`cli`) or by its title, ignoring case. Throws with the closest topics when none matches.
 */
export function findDocTopic(query: string, topics: readonly DocTopic[]): DocTopic {
  const wanted = query.trim().toLowerCase().replace(/^\/?docs\//, '').replace(/^\/+|\/+$/g, '');
  const match = topics.find(item => item.topic === wanted) ?? topics.find(item => item.topic.split('/').pop() === wanted) ?? topics.find(item => item.title.toLowerCase() === wanted);
  if (match) return match;
  const similar = topics.filter(item => item.topic.includes(wanted) || item.title.toLowerCase().includes(wanted)).slice(0, 8).map(item => item.topic);
  throw new Error(`No documentation topic ${query}.${similar.length ? ` Similar topics: ${similar.join(', ')}.` : ''} List the topics with: opsorama docs`);
}

/** The topic list as text, grouped by category; object pages are summarized, since opsorama catalog covers them. */
export function formatTopics(topics: readonly DocTopic[]): string {
  const objects = topics.filter(item => item.topic.startsWith('objects/')).length, groups = new Map<string, DocTopic[]>();
  for (const category of CATEGORY_ORDER) groups.set(category, []);
  for (const item of topics) if (!item.topic.startsWith('objects/')) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  const lines: string[] = [];
  for (const [category, items] of groups) if (items.length) lines.push('', category === 'API REFERENCE' ? 'API reference' : `${category.charAt(0)}${category.slice(1).toLowerCase()}`, ...items.map(item => `  ${item.topic}: ${item.title}. ${item.description}`));
  if (objects) lines.push('', `Objects: ${objects} pages, one per catalog model, as objects/<asset> (for example objects/forklift); find models with opsorama catalog search.`);
  return lines.join('\n').trim();
}
/** Categories in the order of the website navigation; others follow in the order they appear. */
const CATEGORY_ORDER = ['GETTING STARTED', 'FOUNDATIONS', 'COMPONENTS', 'API REFERENCE', 'RECIPES'];

/** The agent skill (SKILL.md) shipped with this version of the package. */
export function skillText(directory = defaultAgentDirectory()): string {
  return fs.readFileSync(agentFile(directory, 'SKILL.md'), 'utf8');
}

/** Result of `installSkill`. */
export interface SkillInstall { file: string; status: 'created' | 'updated' | 'unchanged' }

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Writes the agent skill to `<target>/opsorama/SKILL.md`; the default target is `.claude/skills` in the working directory,
 * where Claude Code finds project skills. Next to it, `.installed.json` records the hash of what was written, so a later run
 * (for example after updating the package) replaces a copy nobody edited, while an edited or foreign SKILL.md is replaced
 * only with `force`.
 */
export function installSkill({ target = path.join('.claude', 'skills'), force = false, directory = defaultAgentDirectory() }: { target?: string; force?: boolean; directory?: string } = {}): SkillInstall {
  const text = skillText(directory), file = path.resolve(target, 'opsorama', 'SKILL.md'), record = path.join(path.dirname(file), '.installed.json');
  const existed = fs.existsSync(file);
  if (existed) {
    const current = fs.readFileSync(file, 'utf8');
    if (current === text) return { file, status: 'unchanged' };
    let installed: string | undefined;
    try { installed = (JSON.parse(fs.readFileSync(record, 'utf8')) as { sha256?: string }).sha256; } catch { /* no record: not written by this command */ }
    if (!force && installed !== sha256(current)) throw new Error(`${file} has local edits or was not installed by opsorama skill. Run again with --force to replace it.`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.writeFileSync(record, `${JSON.stringify({ sha256: sha256(text), note: 'Written by opsorama skill. Edit SKILL.md freely; opsorama skill then asks for --force before replacing it.' }, null, 2)}\n`);
  return { file, status: existed ? 'updated' : 'created' };
}
