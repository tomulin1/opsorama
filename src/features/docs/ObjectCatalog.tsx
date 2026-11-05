'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Box, Search, SlidersHorizontal, X } from 'lucide-react';
import { catalogCategories, catalogObjects } from './objects';
import { assetName, compatibleAssets, handlingAssets, handlingTag } from './object-handling';

export function ObjectCatalog() {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All objects'), [availability, setAvailability] = useState('all'), [compatibleWith, setCompatibleWith] = useState('');
  const [images, setImages] = useState<Record<string, string>>({}), [imageError, setImageError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void import('./object-rendering').then(({ renderThumbnails }) => { if (!abort.signal.aborted) return renderThumbnails(catalogObjects, (slug, image) => setImages(previous => ({ ...previous, [slug]: image })), abort.signal); }).catch(() => { if (!abort.signal.aborted) setImageError(true); });
    return () => abort.abort();
  }, []);
  const related = compatibleWith ? compatibleAssets(compatibleWith) : null;
  const filtered = catalogObjects.filter(item => (category === 'All objects' || item.category === category) && (availability === 'all' || availability === 'portable') && (!related || !!item.asset && related.has(item.asset)) && `${item.name} ${item.category} ${item.asset ?? ''} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  const reset = () => { setQuery(''); setCategory('All objects'); setAvailability('all'); setCompatibleWith(''); };
  return <section className="object-catalog" aria-label="Object catalog">
    <div className="object-catalog-intro"><div><span>YOUR NEXT SCENE STARTS HERE</span><h2>Find the right building block.</h2><p>Browse real models, try their settings, and take the definition into your board.</p></div><div className="object-catalog-total"><strong>{catalogObjects.length}</strong><span>ready to preview</span></div></div>
    <div className="object-catalog-toolbar"><label className="object-search"><Search size={18} /><input aria-label="Search objects" placeholder="Search parcels, people, vehicles…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear object search" onClick={() => setQuery('')}><X size={16} /></button>}</label><label className="object-availability"><SlidersHorizontal size={16} /><select aria-label="Object availability" value={availability} onChange={event => setAvailability(event.target.value)}><option value="all">All availability</option><option value="portable">Portable definitions</option></select></label><label className="object-availability"><SlidersHorizontal size={16} /><select aria-label="Compatible with" value={compatibleWith} onChange={event => setCompatibleWith(event.target.value)}><option value="">Compatible with any</option>{handlingAssets.map(asset => <option key={asset} value={asset}>Compatible with {assetName(asset)}</option>)}</select></label></div>
    <div className="object-categories" aria-label="Object categories">{catalogCategories.map(value => <button aria-pressed={category === value} key={value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="object-results"><span role="status">{filtered.length} {filtered.length === 1 ? 'object' : 'objects'}</span><span>Procedural models · local workspace</span></div>
    {imageError && <p className="object-notice">Model thumbnails are unavailable on this device. Object details and usage guides are still available.</p>}
    <div className="object-grid">{filtered.map(item => <Link className="object-card" href={`/docs/objects/${item.slug}`} key={item.slug} aria-label={`Explore ${item.name}`}><div className="object-card-image">{images[item.slug] ? <Image unoptimized src={images[item.slug]} alt={`${item.name} model preview`} width={480} height={340} /> : <div className="object-image-placeholder"><Box size={48} strokeWidth={1} /><span>{imageError ? 'Preview unavailable' : 'Preparing model…'}</span></div>}<span className="object-badge">Built-in</span><span className="object-motion-tag">{item.animation === 'local' ? 'Animated' : 'Static model'}</span></div><div className="object-card-info"><span>{item.category}</span><div><h3>{item.name}</h3><ArrowUpRight size={17} /></div><p>{item.description}</p><code>{item.asset ?? item.primitive ?? 'Scene primitive'}</code>{item.asset && handlingTag(item.asset) && <small className="object-handling-tag">{handlingTag(item.asset)}</small>}</div></Link>)}</div>
    {!filtered.length && <div className="object-empty"><Box size={35} /><h3>No objects match these filters.</h3><p>Try another name or browse the full collection.</p><button onClick={reset}>Clear filters</button></div>}
    <p className="object-catalog-footnote">Built-in and optional-kit models use the shared JavaScript, React and Vue scene contract. Full palette inheritance and the common object descriptor are the next implementation step.</p>
  </section>;
}
