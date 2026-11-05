'use client';
import Link from 'next/link';
import { useState } from 'react';
import { assetHandling, handlingProfiles } from '@opsorama/renderer-three';
import { assetName, catalogEntryForAsset, catalogFits, fitConditions, handlingAssets } from './object-handling';

/** Units of one domain profile as rows, the receptacles that accept any of them as columns; every cell is text. */
export function HandlingMatrix() {
  const [profile, setProfile] = useState(handlingProfiles[0].id);
  const inProfile = (classId: string) => classId.startsWith(`${profile}/`);
  const units = handlingAssets.filter(asset => { const unit = assetHandling[asset].unit; return unit && inProfile(unit.class); });
  const columns = handlingAssets.flatMap(asset => assetHandling[asset].receptacles.filter(receptacle => catalogFits.some(fit => units.includes(fit.unit) && fit.container === asset && fit.receptacle === receptacle.name)).map(receptacle => ({ asset, receptacle: receptacle.name })));
  const name = (asset: string) => { const entry = catalogEntryForAsset(asset); return entry ? <Link href={`/docs/objects/${entry.slug}`}>{entry.name}</Link> : asset; };
  return <section className="docs-section object-contract object-compatibility" id="matrix" aria-labelledby="handling-matrix-title">
    <h2 id="handling-matrix-title">Compatibility matrix<a href="#matrix" aria-label="Link to Compatibility matrix">#</a></h2>
    <p>Declared units of one domain profile against every receptacle that accepts one of them, computed with <code>handlingFits(assetHandling, handlingProfiles)</code>. “Fits” cells name their conditions; a dash means the receptacle does not accept that unit&apos;s family or class. Bulk receptacles hold host contents lines and are not listed.</p>
    <label className="object-handling-profile">Domain profile <select aria-label="Domain profile" value={profile} onChange={event => setProfile(event.target.value)}>{handlingProfiles.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <div className="object-handling-scroll"><table className="object-handling-matrix">
      <caption>Declared handling compatibility of catalog objects, {handlingProfiles.find(entry => entry.id === profile)!.name} profile</caption>
      <thead><tr><th scope="col">Unit</th>{columns.map(column => <th scope="col" key={`${column.asset}:${column.receptacle}`}>{assetName(column.asset)} <code>{column.receptacle}</code></th>)}</tr></thead>
      <tbody>{units.map(unit => <tr key={unit}><th scope="row">{name(unit)}</th>{columns.map(column => {
        const fit = catalogFits.find(entry => entry.unit === unit && entry.container === column.asset && entry.receptacle === column.receptacle);
        return <td key={`${column.asset}:${column.receptacle}`} title={fit?.message}>{!fit ? '—' : fit.verdict === 'too-large' ? 'Too large' : ['Fits', ...fitConditions(fit)].join(' · ')}</td>;
      })}</tr>)}</tbody>
    </table></div>
  </section>;
}
