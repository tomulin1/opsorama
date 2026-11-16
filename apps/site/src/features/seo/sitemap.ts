import { docs } from '@/features/docs/content';
import { allExamples } from '@/features/examples/catalog';
import { docPath } from './docs';

/** Canonical paths of every indexable page, without duplicates: home, the example gallery and its pages, documentation and the brand page. */
export function sitemapPaths(): string[] {
  return [...new Set(['/', '/examples', ...allExamples.map(example => example.href), ...docs.map(docPath), '/brand'])];
}
