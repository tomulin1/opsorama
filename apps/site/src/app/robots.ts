import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/features/seo/site';

/** robots.txt: the whole public website may be crawled; the sitemap lists every page. */
export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: `${SITE_ORIGIN}/sitemap.xml`, host: SITE_ORIGIN };
}
