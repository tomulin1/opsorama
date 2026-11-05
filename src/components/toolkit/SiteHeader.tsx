import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BookOpen, Github } from 'lucide-react';
import { projectIdentity } from '@/features/brand/project';
export function SiteHeader({ active = 'examples' }: { active?: 'docs' | 'examples' | null }) {
  return <header className="kit-site-header">
    <Link className="kit-site-brand" href="/"><Image src="/brand/opsorama-mark.svg" alt="" width={32} height={32} /><strong>Opsorama</strong><small>3D TOOLKIT</small></Link>
    <nav aria-label="Toolkit navigation">
      <Link className={active === 'docs' ? 'active' : ''} href="/docs">Documentation</Link>
      <Link className={active === 'examples' ? 'active' : ''} href="/examples">Examples</Link>
      <Link href="/docs/objects">Objects</Link>
      <Link href="/examples/adapters">React / Vue / JS</Link>
    </nav>
    <div className="kit-header-links">
      <span className="kit-preview-version">LOCAL PREVIEW · 0.0.1</span>
      <a className="kit-header-github" href={projectIdentity.repositoryUrl} target="_blank" rel="noopener noreferrer" aria-label="Opsorama on GitHub (opens in a new tab)" title="Opsorama on GitHub"><Github size={18} aria-hidden="true" /><span>GitHub</span></a>
      <Link className="kit-header-action" href={active === 'docs' ? '/examples' : '/docs'} aria-label={active === 'docs' ? 'Browse examples' : 'Developer docs'}>{active === 'docs' ? <><span>Browse examples</span><ArrowUpRight size={15} aria-hidden="true" /></> : <><BookOpen size={15} aria-hidden="true" /><span>Developer docs</span></>}</Link>
    </div>
  </header>;
}
