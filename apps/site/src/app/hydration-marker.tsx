'use client';
import { useEffect } from 'react';

/**
 * Sets `data-hydrated="true"` on `<html>` once React has hydrated the page. Effects run children first, so the root
 * layout's effect runs after the page's own effects. End-to-end tests wait for this attribute after every full
 * navigation (`e2e/fixtures.ts`): Next.js 16 hydrates after the `load` event, and React discards input typed into
 * server-rendered controls before hydration. It renders nothing and has no other effect.
 */
export function HydrationMarker() {
  useEffect(() => { document.documentElement.dataset.hydrated = 'true'; }, []);
  return null;
}
