import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/features/seo/site';
import { sitemapPaths } from '@/features/seo/sitemap';

/** sitemap.xml: every prerendered page with its canonical URL (see sitemapPaths). */
export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map(path => ({ url: absoluteUrl(path) }));
}
