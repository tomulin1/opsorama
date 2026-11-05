import { describe, expect, it } from 'vitest';
import { catalogAssets } from '@opsorama/objects';
import { docs } from '../apps/site/src/features/docs/content';
import { llmsFull, llmsIndex, SITE_ORIGIN } from '../apps/site/src/features/docs/llms';

describe('llms.txt', () => {
  it('links every documentation page from the index', () => {
    const index = llmsIndex();
    expect(index.startsWith('# Opsorama\n\n> ')).toBe(true);
    for (const article of docs) expect(index, article.slug).toContain(`](${SITE_ORIGIN}/docs${article.slug ? `/${article.slug}` : ''})`);
  });

  it('carries every page and every catalog asset with its kit in the full text', () => {
    const full = llmsFull();
    for (const article of docs) expect(full).toContain(`## ${article.title}`);
    for (const asset of Object.keys(catalogAssets)) expect(full, asset).toMatch(new RegExp(`- \`${asset}\` — .*import from \`@opsorama/objects/[a-z-]+\``));
  });

  it('contains no references to records outside the public repository', () => {
    expect(llmsIndex() + llmsFull()).not.toMatch(/\bADR[ -]?\d{4}\b|docs\/decisions\//);
  });
});
