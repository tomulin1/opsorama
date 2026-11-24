import type { Metadata, Viewport } from 'next';
import { projectIdentity } from '@/features/brand/project';
import { LLMS_ALTERNATE, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_THEME_COLOR, SITE_TITLE, SOCIAL_IMAGE } from '@/features/seo/site';
import { HydrationMarker } from './hydration-marker';
import './palette.css';
import './globals.css';
import './toolkit.css';
import './hud.css';
import './ecommerce.css';
import './cutoff.css';
import './office.css';
import './restaurant.css';
import './aquatics.css';
import './farm.css';
import './warehouse.css';
import './examples.css';
import './objects.css';
import './measurements.css';
import './motion.css';
import './brand.css';
import './landing.css';
/** Site-wide defaults. Every page overrides title, description, canonical URL and social cards through `pageMetadata` (src/features/seo/site.ts). */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: projectIdentity.authorName, url: projectIdentity.repositoryUrl }],
  creator: projectIdentity.authorName,
  publisher: projectIdentity.authorName,
  category: 'technology',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }] },
  icons: { icon: [{ url: '/brand/opsorama-mark.svg', type: 'image/svg+xml' }], apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] },
  alternates: { types: LLMS_ALTERNATE },
};
export const viewport: Viewport = { themeColor: SITE_THEME_COLOR };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<HydrationMarker /></body></html>; }
