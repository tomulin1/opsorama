'use client';
import { createElement, useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Box, ChevronRight, Code2, Layers, Search, X } from 'lucide-react';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { docs, docsNavigation, type DocArticle, type DocDemo } from './content';
import { CodeBlock } from './CodeBlock';
import { LivePlayground } from './LivePlayground';
import dynamic from 'next/dynamic';
import { catalogObjects } from './objects';
// The panel samples are loaded dynamically; a static import keeps their layout styles in the page bundle.
import './panels.css';
const ObjectCatalog = dynamic(() => import('./ObjectCatalog').then(module => module.ObjectCatalog));
const ObjectDetails = dynamic(() => import('./ObjectDetails').then(module => module.ObjectDetails));
const SurfaceLabelExample = dynamic(() => import('./SurfaceLabelExample').then(module => module.SurfaceLabelExample));
const PanelExamples = dynamic(() => import('./PanelExamples').then(module => module.PanelExamples));
const HandlingMatrix = dynamic(() => import('./HandlingMatrix').then(module => module.HandlingMatrix));
const ZoomControlConfigurator = dynamic(() => import('./ZoomControlConfigurator').then(module => module.ZoomControlConfigurator));
const MarkerExample = dynamic(() => import('./MarkerExample').then(module => module.MarkerExample));
const DOC_DEMOS: Record<DocDemo, ComponentType> = {
  'metric-configurator': dynamic(() => import('./PanelDemos').then(module => module.MetricConfigurator)),
  'metric-matrix': dynamic(() => import('./PanelDemos').then(module => module.MetricMatrix)),
  'metric-tones': dynamic(() => import('./PanelDemos').then(module => module.MetricTones)),
  'panel-states': dynamic(() => import('./PanelDemos').then(module => module.PanelStates)),
  'hud-composition': dynamic(() => import('./PanelDemos').then(module => module.HudComposition)),
  'panel-adapters': PanelExamples,
};
const href = (slug: string) => `/docs${slug ? `/${slug}` : ''}`;
export function DocsPage({ article }: { article: DocArticle }) {
  const object = catalogObjects.find(item => article.slug === `objects/${item.slug}`);
  const isCatalog = article.slug === 'objects' || !!object;
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); search.current?.focus(); } if (event.key === 'Escape') { setQuery(''); search.current?.blur(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const [query, setQuery] = useState(''); const matches = (slug: string, title: string) => { const doc = docs.find(d => d.slug === slug); return `${title} ${doc?.description} ${doc?.sections.map(s => s.title).join(' ')}`.toLowerCase().includes(query.toLowerCase()); };
  const flat = docsNavigation.flatMap(group => group.items); const index = flat.findIndex(item => item.slug === article.slug); const previous = flat[index - 1], next = flat[index + 1];
  return <main className={`docs-page${isCatalog ? " object-docs-page" : ""}`}><SiteHeader active="docs" /><div className="docs-layout"><aside className="docs-sidebar"><label className="docs-search"><Search size={15} /><input ref={search} aria-label="Search documentation" placeholder="Search documentation…" value={query} onChange={e => setQuery(e.target.value)} />{query ? <button aria-label="Clear documentation search" onClick={() => setQuery('')}><X size={12} /></button> : <kbd>/</kbd>}</label><nav aria-label="Documentation sections">{docsNavigation.map(group => { const items = group.items.filter(item => matches(item.slug, item.title)); if (!items.length) return null; return <div key={group.title}><h3>{group.title}</h3>{items.map(item => <Link aria-current={item.slug === article.slug ? 'page' : undefined} className={item.slug === article.slug ? 'active' : ''} key={item.slug} href={href(item.slug)}>{item.title}{item.slug === article.slug && <span />}</Link>)}</div>; })}{query && !flat.some(item => matches(item.slug, item.title)) && <p className="docs-search-empty">No matching pages.<button onClick={() => setQuery('')}>Clear search</button></p>}</nav><div className="docs-sidebar-note"><Box size={18} /><div><strong>Build your first board</strong><span>Start with the e-commerce recipe.</span></div><Link aria-label="Open e-commerce recipe" href="/examples/ecommerce"><ArrowUpRight size={15} /></Link></div></aside>
    <article className="docs-article"><div className="docs-breadcrumb"><span>Documentation</span><ChevronRight size={11} /><span>{article.title}</span></div><span className="docs-eyebrow">{article.category}</span><h1>{article.title}</h1><p className="docs-lead">{article.description}</p><div className="docs-article-meta"><span><i />Implemented preview</span><span>TypeScript</span><span>{article.slug === 'recipes/ecommerce' || article.slug === 'recipes/office' ? 'React recipe' : 'React + Vue'}</span></div>
      {!article.slug && <div className="docs-entry-cards"><Link href="/examples"><div><Box size={20} /><ArrowUpRight size={15} /></div><strong>Explore the examples</strong><p>E-commerce, open offices, and reusable scene building blocks.</p></Link><Link href="/docs/objects"><div><Layers size={20} /><ArrowRight size={15} /></div><strong>Browse the objects</strong><p>Preview models and choose the pieces for your scene.</p></Link><Link href="/docs/api/core"><div><Code2 size={20} /><ArrowRight size={15} /></div><strong>Connect your data</strong><p>A shared model, with your own business rules.</p></Link></div>}
      {article.slug === 'objects' && <ObjectCatalog />}
      {article.slug === 'zoom-control' && <ZoomControlConfigurator />}
      {article.slug === 'scene-markers' && <MarkerExample />}
      {article.slug === 'components/asset' && <section className="docs-section" aria-label="Surface label preview"><h2>Try text and SVG labels</h2><p>A storefront sign using the same surfaceLabel contract through native React, Vue and JavaScript. Labels attach to the model and remain visible with motion disabled.</p><SurfaceLabelExample /></section>}
      {object && <ObjectDetails key={object.slug} item={object} />}
      {article.playground && <section className="docs-section docs-playground-section" id="playground"><div className="docs-section-heading"><h2>A small scene. Real controls.</h2><span>LIVE PLAYGROUND</span></div><p>Adjust settings, select a parcel, or move an order. The code updates with the actual scene configuration.</p><LivePlayground /></section>}
      {article.sections.map(section => <section className="docs-section" key={section.id} id={section.id}><h2>{section.title}<a href={`#${section.id}`} aria-label={`Link to ${section.title}`}>#</a></h2>{section.paragraphs?.map(p => <p key={p}>{p}</p>)}{section.list && <ul>{section.list.map(item => <li key={item}>{item}</li>)}</ul>}{section.code && <CodeBlock code={section.code} language={section.language} />}{section.rows && <div className="docs-reference-table"><table><thead><tr>{section.headers?.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{j === 0 ? <code>{cell}</code> : cell}</td>)}</tr>)}</tbody></table></div>}{section.demo && createElement(DOC_DEMOS[section.demo])}</section>)}
      {article.slug === 'handling' && <HandlingMatrix />}
      <div className="docs-pagination">{previous && <Link href={href(previous.slug)}><span>PREVIOUS</span><strong>← {previous.title}</strong></Link>}{next && <Link href={href(next.slug)}><span>NEXT</span><strong>{next.title} →</strong></Link>}</div><footer className="docs-article-footer"><span>Opsorama · Private workspace preview · Not published on npm.</span><nav className="site-footer-links" aria-label="Footer"><Link href="/brand">Website colors</Link><Link href="/examples/adapters">Try all framework adapters<ArrowUpRight size={12} /></Link><ProjectLinks /></nav></footer>
    </article><aside className="docs-toc"><h3>ON THIS PAGE</h3>{article.playground && <a href="#playground">Live playground</a>}{article.sections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}<div><strong>Learn by building</strong><p>Explore the e-commerce recipe and its shared scene components.</p><Link href="/examples/ecommerce">Open example<ArrowUpRight size={12} /></Link></div></aside></div></main>;
}
