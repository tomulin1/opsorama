import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const compat = new FlatCompat({ baseDirectory: import.meta.dirname, resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next/package.json')) });
const config = [...compat.extends('next/core-web-vitals', 'next/typescript'), { files: ['packages/vue/**/*.ts', 'examples/vue-minimal/**/*.ts'], rules: { 'react-hooks/rules-of-hooks': 'off' } }, { ignores: ['.claude/**', '.next/**', '.next-dev/**', 'node_modules/**', '**/node_modules/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**', 'artifacts/**'] }];
export default config;
