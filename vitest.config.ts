import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': fileURLToPath(new URL('./apps/site/src', import.meta.url)) } }, test: { include: ['tests/**/*.test.ts'] } });
