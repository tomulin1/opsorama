import type { Metadata } from 'next';
import { projectIdentity } from '@/features/brand/project';

/** Public origin of the website, without a trailing slash. Canonical URLs, the sitemap, robots.txt, llms.txt and structured data are built from it. */
export const SITE_ORIGIN = 'https://opsorama.dev';
export const SITE_NAME = 'Opsorama';
/** Default meta description for pages that do not set their own (about 160 characters, the length search results show). */
export const SITE_DESCRIPTION = 'Open-source toolkit for animated 3D operations dashboards: warehouses, shops, offices, datacenters and more. Native React and Vue adapters and plain JavaScript.';
/** Title of the home page and the fallback document title. */
export const SITE_TITLE = 'Opsorama — Animated 3D dashboards for React, Vue and JavaScript';
/** Browser and manifest theme color: the white site header (`--opsorama-surface-raised`). */
export const SITE_THEME_COLOR = '#FFFFFF';

/** An image for Open Graph and X (Twitter) cards. `url` is site-relative; `metadataBase` in the root layout makes it absolute. */
export interface SocialImage {
  url: string;
  /** Pixels. */
  width: number;
  /** Pixels. */
  height: number;
  alt: string;
}

/** Default social preview, 1200 × 630 PNG. Regenerate with `node apps/site/scripts/capture-social-image.mjs`. */
export const SOCIAL_IMAGE: SocialImage = { url: '/social/opsorama.png', width: 1200, height: 630, alt: 'Opsorama — animated 3D dashboards for React, Vue and JavaScript' };

export interface PageSeo {
  /** Complete document title, used as is (no template is applied), for example `Datacenter operations · Opsorama`. Keep it unique per page. */
  title: string;
  /** Meta, Open Graph and X description. Aim for 70–160 characters. */
  description: string;
  /** Site-relative canonical path without a trailing slash, for example `/docs/quickstart`; `/` for the home page. */
  path: string;
  /** Social preview image; defaults to {@link SOCIAL_IMAGE}. */
  image?: SocialImage;
  /** Open Graph type; documentation pages are `article`. Defaults to `website`. */
  type?: 'website' | 'article';
}

/** `<link rel="alternate" type="text/plain">` to the llms.txt documentation index, set on every page. */
export const LLMS_ALTERNATE = { 'text/plain': [{ url: '/llms.txt', title: 'Opsorama documentation for language models' }] };

/** Absolute URL for a site-relative path. */
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;

/**
 * Complete metadata for one page: title, description, canonical URL, Open Graph and X card.
 * Next.js replaces (does not merge) `alternates`, `openGraph` and `twitter` objects from parent layouts, so every page sets all of them here.
 */
export function pageMetadata({ title, description, path, image = SOCIAL_IMAGE, type = 'website' }: PageSeo): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path, types: LLMS_ALTERNATE },
    openGraph: { type, siteName: SITE_NAME, locale: 'en_US', url: path, title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image.url, alt: image.alt }] },
  };
}

/** The project author as a schema.org Person, shared by the structured data blocks. */
export const authorSchema = { '@type': 'Person', name: projectIdentity.authorName, url: projectIdentity.repositoryUrl } as const;
