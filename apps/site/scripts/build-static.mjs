#!/usr/bin/env node
/** Builds the static export for Cloudflare into apps/site/out (see next.config.ts). Usage: pnpm --filter @opsorama/site build:static */
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'next', 'build'], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, OPSORAMA_STATIC_EXPORT: '1', NEXT_TELEMETRY_DISABLED: '1' } });
process.exit(result.status ?? 1);
