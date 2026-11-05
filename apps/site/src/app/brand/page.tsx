import Link from 'next/link';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { BrandPalette } from '@/features/brand/BrandPalette';
import palette from '@/features/brand/palette.json';

export const metadata = {
  title: 'Website brand & colors · Opsorama',
  description: 'The palette for the Opsorama example website. Object appearances and real dashboard palettes are configured separately.',
};

export default function WebsiteBrandPage() {
  return <main className="website-brand-page"><SiteHeader active={null} />
    <article className="website-brand-content">
      <header><span className="docs-eyebrow">ABOUT THIS WEBSITE</span><h1>Website brand & colors</h1>
        <p>The Flow symbol and Cornflower blue palette style the Opsorama example website: its navigation, documentation, catalog interface and HTML controls.</p>
      </header>
      <section aria-labelledby="object-colors"><h2 id="object-colors">Object and scene colors</h2>
        <p>Catalog objects have their own designed appearance and supported material customizations. The website palette does not define their colors.</p>
        <p>In a real dashboard, the host application can supply its own scene palette, such as company brand colors, and supported per-object overrides. Each object applies the material roles it supports; operational states retain their meanings.</p>
        <p>See the <Link href="/docs/objects">object catalog</Link> and <Link href="/docs/object-contract">object styling reference</Link> for model-specific options.</p>
      </section>
      <section aria-labelledby="website-palette"><h2 id="website-palette">Example website palette</h2>
        <p>These shades belong to the example website. Blue, slate and peach run from 50 (lightest) to 950 (darkest); success, warning and danger describe website UI feedback.</p>
        <BrandPalette />
      </section>
      <section aria-labelledby="website-roles"><h2 id="website-roles">Website color roles</h2>
        <dl className="website-color-roles">
          <div><dt>Website headings and wordmark</dt><dd><code>{palette.families.blue['900']}</code></dd></div>
          <div><dt>Website primary actions</dt><dd><code>{palette.families.blue['600']}</code> with white labels</dd></div>
          <div><dt>Website body and code text</dt><dd><code>{palette.families.slate['600']}</code></dd></div>
          <div><dt>Documentation panels</dt><dd><code>{palette.families.blue['100']}</code></dd></div>
        </dl>
        <p>Lighter shades support surfaces and decoration; darker shades support readable text and controls. Individual foreground/background pairs still need a contrast check.</p>
      </section>
      <footer className="website-brand-footer"><span>Opsorama example website</span><nav className="site-footer-links" aria-label="Footer"><Link href="/docs">Documentation</Link><Link href="/examples">Examples</Link><ProjectLinks /></nav></footer>
    </article>
  </main>;
}
