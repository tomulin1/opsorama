import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_THEME_COLOR } from '@/features/seo/site';

/** Web app manifest: name, icons and colors for bookmarks and home-screen shortcuts. The website is not an installable offline app. */
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME, short_name: SITE_NAME, description: SITE_DESCRIPTION, start_url: '/', display: 'browser',
    background_color: '#F3F6FB', theme_color: SITE_THEME_COLOR,
    icons: [{ src: '/brand/opsorama-mark.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  };
}
