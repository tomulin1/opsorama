import type { Metadata } from 'next';
import type { DocArticle } from '@/features/docs/content';
import { absoluteUrl, authorSchema, pageMetadata, SITE_NAME, SITE_ORIGIN } from './site';

const OBJECT_PREFIX = 'objects/';

/** Site-relative URL of a documentation page: `/docs` for the introduction, `/docs/<slug>` otherwise. */
export const docPath = (article: DocArticle) => `/docs${article.slug ? `/${article.slug}` : ''}`;

/** Unique document title: catalog objects read `<name> · 3D object · Opsorama`, other pages `<title> · Opsorama docs`. */
export function docTitle(article: DocArticle): string {
  if (!article.slug) return 'Documentation · Opsorama';
  if (article.slug.startsWith(OBJECT_PREFIX)) return `${article.title} · 3D object · ${SITE_NAME}`;
  return `${article.title} · ${SITE_NAME} docs`;
}

/** Meta description; catalog object descriptions are one short sentence, so they gain the context a search result needs. */
export function docDescription(article: DocArticle): string {
  if (article.slug.startsWith(OBJECT_PREFIX)) return `${article.description} A 3D model from the Opsorama object catalog with React, Vue and JavaScript usage.`;
  return article.description;
}

export function docMetadata(article: DocArticle): Metadata {
  return pageMetadata({ title: docTitle(article), description: docDescription(article), path: docPath(article), type: 'article' });
}

/**
 * schema.org data for a documentation page: a TechArticle and its BreadcrumbList
 * (Home › Documentation › Object catalog › page). Intermediate slug segments such as `api/` are not pages, so they are not crumbs.
 */
export function docStructuredData(article: DocArticle): Record<string, unknown> {
  const url = absoluteUrl(docPath(article));
  const crumbs: [string, string][] = [['Home', absoluteUrl('/')], ['Documentation', absoluteUrl('/docs')]];
  if (article.slug === 'objects' || article.slug.startsWith(OBJECT_PREFIX)) crumbs.push(['Object catalog', absoluteUrl('/docs/objects')]);
  if (article.slug && article.slug !== 'objects') crumbs.push([article.title, url]);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'TechArticle', '@id': `${url}#article`, headline: article.slug ? article.title : 'Opsorama documentation', description: docDescription(article), url, inLanguage: 'en', author: authorSchema, isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_ORIGIN}/` } },
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, item], index) => ({ '@type': 'ListItem', position: index + 1, name, item })) },
    ],
  };
}
