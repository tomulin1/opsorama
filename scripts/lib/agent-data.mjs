/**
 * Agent data that @opsorama/cli ships next to its code, so `opsorama docs` and `opsorama skill` work from an npm install:
 * - docs.json: every documentation page of the website as Markdown (the text of llms-full.txt, one entry per page);
 * - SKILL.md: the agent skill from skills/opsorama.
 * Written to packages/cli/dist/agent by pnpm build:packages, and to packages/cli/.dev/agent by pnpm opsorama.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './packages.mjs';

/** Every documentation page: `{ topic, title, category, description, markdown }`, in website order. */
export async function documentationTopics() {
  const docsDir = path.join(root, 'apps/site/src/features/docs');
  const contents = [
    `import { docs } from ${JSON.stringify(path.join(docsDir, 'content.ts'))};`,
    `import { articleMarkdown } from ${JSON.stringify(path.join(docsDir, 'llms.ts'))};`,
    `export const topics = docs.map(article => ({ topic: article.slug || 'introduction', title: article.title, category: article.category, description: article.description, markdown: articleMarkdown(article) }));`,
  ].join('\n');
  const temp = path.join(root, 'node_modules/.cache', `opsorama-docs-${process.pid}-${Date.now()}.mjs`);
  fs.mkdirSync(path.dirname(temp), { recursive: true });
  try {
    await esbuild.build({
      stdin: { contents, resolveDir: path.join(root, 'apps/site'), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: temp, logLevel: 'error',
      alias: { '@': path.join(root, 'apps/site/src') }, external: ['three', 'three/*'], loader: { '.css': 'empty', '.png': 'empty', '.webp': 'empty', '.svg': 'empty' },
    });
    const { topics } = await import(pathToFileURL(temp).href);
    return topics;
  } finally { fs.rmSync(temp, { force: true }); }
}

/** Writes docs.json and SKILL.md into `directory`. */
export async function writeAgentData(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const topics = await documentationTopics();
  fs.writeFileSync(path.join(directory, 'docs.json'), JSON.stringify({ format: 'opsorama-docs', version: 1, topics }));
  fs.copyFileSync(path.join(root, 'skills/opsorama/SKILL.md'), path.join(directory, 'SKILL.md'));
  return { topics: topics.length };
}
