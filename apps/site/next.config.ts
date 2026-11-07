import type { NextConfig } from 'next';

/**
 * `OPSORAMA_STATIC_EXPORT=1 next build` writes a static site to `out/` for Cloudflare (every page is prerendered).
 * A static export cannot run Next.js redirects or the image optimizer, so it serves images as they are and leaves
 * redirects to `public/_redirects`, which Cloudflare reads. Keep both redirect lists in sync.
 */
const staticExport = process.env.OPSORAMA_STATIC_EXPORT === '1';
const nextConfig: NextConfig = {
  devIndicators: false,
  // The repository's AGENTS.md is the single source of agent rules; `next dev` must not write its own apps/site/AGENTS.md.
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@opsorama/core', '@opsorama/three', '@opsorama/objects', '@opsorama/react', '@opsorama/vue', '@opsorama/ui'],
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  ...(staticExport
    ? { output: 'export', images: { unoptimized: true }, trailingSlash: false }
    : { async redirects() { return [{ source: '/docs/brand', destination: '/brand', permanent: true }]; } }),
};
export default nextConfig;
