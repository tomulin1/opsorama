import type { NextConfig } from 'next';
const nextConfig: NextConfig = { devIndicators: false, allowedDevOrigins: ['127.0.0.1'], transpilePackages: ['@opsorama/core', '@opsorama/three', '@opsorama/objects', '@opsorama/react', '@opsorama/vue', '@opsorama/ui'], distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next', async redirects() { return [{ source: '/docs/brand', destination: '/brand', permanent: true }]; } };
export default nextConfig;
