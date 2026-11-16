import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docs } from '../apps/site/src/features/docs/content';
import { allExamples, exampleMetadata } from '../apps/site/src/features/examples/catalog';
import { docMetadata, docPath, docStructuredData, docTitle } from '../apps/site/src/features/seo/docs';
import { SITE_ORIGIN, SOCIAL_IMAGE } from '../apps/site/src/features/seo/site';
import { sitemapPaths } from '../apps/site/src/features/seo/sitemap';

const site = new URL('../apps/site/', import.meta.url);
const exampleRoutes = readdirSync(new URL('src/app/examples/', site), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `/examples/${entry.name}`);

describe('technical SEO', () => {
  it('gives every example page gallery metadata with a canonical URL and an existing preview image', () => {
    for (const route of exampleRoutes) {
      const page = readFileSync(new URL(`src/app${route}/page.tsx`, site), 'utf8');
      expect(page, route).toContain(`exampleMetadata('${route}')`);
      const metadata = exampleMetadata(route);
      expect(metadata.alternates?.canonical, route).toBe(route);
      const image = (metadata.openGraph?.images as { url: string }[])[0];
      expect(existsSync(new URL(`public${image.url}`, site)), image.url).toBe(true);
    }
  });

  it('lists every example page and documentation page once in the sitemap', () => {
    const paths = sitemapPaths();
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of ['/', '/examples', '/brand', ...exampleRoutes, ...docs.map(docPath)]) expect(paths, path).toContain(path);
    for (const example of allExamples) expect(paths, example.href).toContain(example.href);
  });

  it('gives every documentation page a unique title and description', () => {
    const titles = docs.map(docTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const article of docs) {
      const metadata = docMetadata(article);
      expect(metadata.description, article.slug).toBeTruthy();
      expect(metadata.alternates?.canonical, article.slug).toBe(docPath(article));
    }
  });

  it('builds absolute breadcrumbs for documentation pages', () => {
    const forklift = docs.find(article => article.slug === 'objects/forklift');
    expect(forklift).toBeDefined();
    const graph = docStructuredData(forklift!)['@graph'] as { '@type': string; itemListElement?: { name: string; item: string }[] }[];
    const crumbs = graph.find(node => node['@type'] === 'BreadcrumbList')!.itemListElement!;
    expect(crumbs.map(crumb => crumb.item)).toEqual([`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/docs`, `${SITE_ORIGIN}/docs/objects`, `${SITE_ORIGIN}/docs/objects/forklift`]);
  });

  it('ships the default social image and the apple touch icon', () => {
    expect(existsSync(new URL(`public${SOCIAL_IMAGE.url}`, site))).toBe(true);
    expect(existsSync(new URL('public/brand/apple-touch-icon.png', site))).toBe(true);
  });
});
