import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/toolkit/SiteHeader';

/** Served with status 404 (404.html in the static export); `robots` replaces the site-wide `index` so crawlers see only `noindex`. */
export const metadata: Metadata = { title: { absolute: 'Page not found · Opsorama' }, robots: { index: false, follow: true }, description: 'This page does not exist. Open the documentation, the examples or the object catalog instead.' };

export default function NotFound() {
  return <main className="website-brand-page"><SiteHeader active={null} />
    <article className="website-brand-content">
      <header><span className="docs-eyebrow">404</span><h1>Page not found</h1>
        <p>The page may have moved or never existed. Continue with one of these:</p>
      </header>
      <nav aria-label="Suggested pages"><ul>
        <li><Link href="/">Home</Link></li>
        <li><Link href="/docs">Documentation</Link></li>
        <li><Link href="/examples">Examples</Link></li>
        <li><Link href="/docs/objects">Object catalog</Link></li>
      </ul></nav>
    </article>
  </main>;
}
