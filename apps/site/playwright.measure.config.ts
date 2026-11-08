import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Runs only the tests tagged `@measure` (WebGL resources of the domain scenes, repeated e-commerce remounts) against the
 * production build. They print their measurements to the console and take several minutes. Run with
 * `pnpm test:e2e:measure`; regular runs and CI exclude them (playwright.config.ts).
 */
export default defineConfig({ ...base, grep: /@measure/, grepInvert: undefined });
