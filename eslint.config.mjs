import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const compat = new FlatCompat({ baseDirectory: import.meta.dirname, resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next/package.json')) });
const config = [...compat.extends('next/core-web-vitals', 'next/typescript'), { settings: { next: { rootDir: 'apps/site/' } } }, { files: ['packages/vue/**/*.ts', 'apps/site/examples/vue-minimal/**/*.ts'], rules: { 'react-hooks/rules-of-hooks': 'off' } }, { ignores: ['.claude/**', '**/dist/**', 'apps/site/out/**', '**/.next/**', '**/.next-dev/**', '**/node_modules/**', '**/next-env.d.ts', '**/playwright-report/**', '**/test-results/**', 'artifacts/**'] }];
export default config;
