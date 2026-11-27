import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { ExampleCard } from '@/components/toolkit/ExampleCard';
import { domainExamples, toolkitExamples } from '@/features/examples/catalog';
import { pageMetadata } from '@/features/seo/site';

export const metadata = pageMetadata({ title: 'Examples', description: 'Interactive 3D dashboard examples for e-commerce, warehouses, offices, restaurants, datacenters, aquatic centres and farms, plus focused toolkit demos for React, Vue and JavaScript.', path: '/examples' });

export default function ExamplesPage() {
  return <main className="examples-page">
    <SiteHeader />
    <div className="examples-container">
      <header className="examples-heading">
        <div className="examples-hero-image">
          <Image src="/example-previews/city.webp" alt="" fill preload unoptimized />
        </div>
        <div className="examples-hero-copy">
          <h1>Explore 3D dashboards.</h1>
          <p>Open an interactive scene or try a focused toolkit demo. All examples run locally with fictional data.</p>
          <div className="examples-hero-actions">
            <Link href="#domain-examples">Browse examples<ArrowDown size={16} aria-hidden="true" /></Link>
            <Link href="/docs">Start building<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </header>
      <section aria-labelledby="domain-examples">
        <h2 id="domain-examples">Domain examples</h2>
        <div className="examples-grid">{domainExamples.map(example => <ExampleCard key={example.href} example={example} />)}</div>
      </section>
      <section aria-labelledby="toolkit-examples">
        <h2 id="toolkit-examples">Toolkit examples</h2>
        <div className="examples-grid">{toolkitExamples.map(example => <ExampleCard key={example.href} example={example} />)}</div>
      </section>
      <footer>
        <p>External integrations remain separate from these mock examples. Your host owns data, permissions and commands.</p>
        <nav className="site-footer-links" aria-label="Footer">
          <Link href="/brand">Website colors</Link>
          <Link href="/docs">Read the documentation →</Link>
          <ProjectLinks />
        </nav>
      </footer>
    </div>
  </main>;
}
