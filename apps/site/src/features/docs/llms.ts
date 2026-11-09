import { docs, type DocArticle, type DocSection } from './content';
import { catalogObjects, objectKit } from './objects';

/** Public origin of the documentation website; llms.txt links are absolute. */
export const SITE_ORIGIN = 'https://opsorama.dev';
const articleUrl = (article: DocArticle) => `${SITE_ORIGIN}/docs${article.slug ? `/${article.slug}` : ''}`;

const INTRO = [
  '# Opsorama',
  '',
  '> Open-source toolkit for animated 3D dashboards in existing admin interfaces, with native React and Vue adapters and plain JavaScript support. The host application keeps its data, rules and commands; Opsorama draws the scene.',
  '',
  'Packages: `@opsorama/core` (framework-free scene model), `@opsorama/three` (Three.js renderer, ships no models), `@opsorama/objects` (161 procedural models in 21 kits on subpaths such as `@opsorama/objects/vehicles`, plus `catalogAssets` and `catalog.json`), `@opsorama/react`, `@opsorama/vue`, `@opsorama/ui` (optional panels).',
  'Key rule: the renderer needs an explicit `assets` registry, for example `createAssetRegistry(workItemsKit, furnitureKit)`. Pre-release: packages are not on npm yet and the API can change before 1.0.',
];

/** The llms.txt index: one line per documentation page and the object catalog, with absolute links. */
export function llmsIndex(): string {
  const byCategory = new Map<string, DocArticle[]>();
  for (const article of docs) byCategory.set(article.category, [...(byCategory.get(article.category) ?? []), article]);
  const sections = [...byCategory].map(([category, articles]) => [`## ${category.charAt(0) + category.slice(1).toLowerCase()}`, '', ...articles.map(article => `- [${article.title}](${articleUrl(article)}): ${article.description}`)].join('\n'));
  return [...INTRO, '', ...sections.flatMap(section => [section, '']),
    '## Objects', '', `- [Object browser](${SITE_ORIGIN}/docs/objects): every catalog object with its kit, options and usage snippets.`, `- [Full text](${SITE_ORIGIN}/llms-full.txt): all documentation pages and the object list in one file.`, '',
    '## Optional', '', '- [Source and starters](https://github.com/tomulin1/opsorama): repository with the packages, standalone starters in `examples/` and the agent skill in `skills/opsorama`.', ''].join('\n');
}

function sectionText(section: DocSection): string {
  const parts = [`### ${section.title}`];
  for (const paragraph of section.paragraphs ?? []) parts.push(paragraph);
  if (section.list?.length) parts.push(section.list.map(item => `- ${item}`).join('\n'));
  if (section.rows?.length) {
    const headers = section.headers ?? section.rows[0].map((_, index) => `Column ${index + 1}`);
    parts.push([`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...section.rows.map(row => `| ${row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n'));
  }
  if (section.code) parts.push(`\`\`\`${section.language ?? 'ts'}\n${section.code}\n\`\`\``);
  return parts.join('\n\n');
}

/** llms-full.txt: every documentation page as Markdown, followed by the object list with kits. */
export function llmsFull(): string {
  const articles = docs.map(article => [`## ${article.title}`, `Source: ${articleUrl(article)}`, article.description, ...article.sections.map(sectionText)].join('\n\n'));
  const objects = catalogObjects.map(item => `- \`${item.asset ?? item.primitive ?? item.slug}\` — ${item.name} (${item.asset ? `kit \`${objectKit(item.asset)}\`, import from \`@opsorama/objects/${objectKit(item.asset)}\`` : 'scene primitive'}): ${item.description}`);
  return [...INTRO, '', ...articles.flatMap(article => [article, '']), '## Object catalog', '', ...objects, ''].join('\n');
}
