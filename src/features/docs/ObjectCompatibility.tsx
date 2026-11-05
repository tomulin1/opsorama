import Link from 'next/link';
import type { HandlingFit } from '@opsorama/core';
import { catalogEntryForAsset, fitConditions, fitDetail, handlingFacts } from './object-handling';

const ObjectLink = ({ asset }: { asset: string }) => { const entry = catalogEntryForAsset(asset); return entry ? <Link href={`/docs/objects/${entry.slug}`}>{entry.name}</Link> : <code>{asset}</code>; };

/** Declared handling compatibility of a catalog object: what it fits into and what it holds. */
export function ObjectCompatibility({ asset }: { asset: string }) {
  const facts = handlingFacts(asset);
  return <section className="object-contract object-compatibility" aria-labelledby="object-compatibility-title">
    <h2 id="object-compatibility-title">Compatibility</h2>
    {!facts ? <p>Handling compatibility is not declared for this object yet. See <Link href="/docs/handling">handling compatibility</Link> for the objects that declare it.</p> : <>
      <p>Declared compatibility (<code>assetHandling[&apos;{asset}&apos;]</code>{facts.unit ? <>, class of the {facts.unit.profile} profile</> : null}), derived with <code>handlingFits</code> and checked against the model by <code>checkAssetHandling</code>. <code>createHandlingState</code> checks moves against these declarations, also for agents with its <code>handling</code> option and for optional move mode. See the <Link href="/docs/handling">compatibility matrix</Link>.</p>
      {facts.unit && <>
        <h3>Handling unit</h3>
        <table><tbody>
          <tr><th scope="row">Class</th><td><code>{facts.unit.classId}</code> · {facts.unit.className}{facts.unit.variants.length > 0 && <> · variants use <code>{facts.unit.variants.join(', ')}</code></>}</td></tr>
          <tr><th scope="row">Family</th><td>{facts.unit.family}</td></tr>
          <tr><th scope="row">Nominal size</th><td>{facts.unit.size} (width × depth × height)</td></tr>
          <tr><th scope="row">Stacking</th><td>{facts.unit.stacking}</td></tr>
          <tr><th scope="row">Placement scale</th><td><code>scale: [{facts.unit.scale}, {facts.unit.scale}, {facts.unit.scale}]</code> gives the nominal size</td></tr>
        </tbody></table>
        <h3>Fits into</h3>
        {facts.fitsInto.length ? <FitList fits={facts.fitsInto} side="container" /> : <p>No declared receptacle accepts this unit yet.</p>}
        {facts.tooLarge.length > 0 && <><h3>Too large for</h3><ul className="object-handling-list">{facts.tooLarge.map(fit => <li key={`${fit.container}:${fit.receptacle}`}><ObjectLink asset={fit.container} />: {fit.message}</li>)}</ul></>}
      </>}
      {facts.receptacles.length > 0 && <>
        <h3>Holds</h3>
        <div className="object-handling-scroll"><table className="object-handling-receptacles"><thead><tr><th scope="col">Receptacle</th><th scope="col">Arrangement</th><th scope="col">Anchors</th><th scope="col">Capacity</th><th scope="col">Clear space</th><th scope="col">Access</th><th scope="col">Accepts</th></tr></thead>
          <tbody>{facts.receptacles.map(receptacle => <tr key={receptacle.name}><td><code>{receptacle.name}</code>{receptacle.reachedFrom && <small> from <code>{receptacle.reachedFrom}</code> slots</small>}</td><td>{receptacle.arrangement}</td><td><code>{receptacle.anchors}</code></td><td>{receptacle.capacity}</td><td>{receptacle.envelope}</td><td>{receptacle.access}</td><td>{receptacle.accepts}</td></tr>)}</tbody>
        </table></div>
        {facts.receptacles.map(receptacle => <div key={receptacle.name} className="object-handling-receptacle">
          <h4><code>{receptacle.name}</code> holds</h4>
          {receptacle.arrangement === 'bulk' ? <p>Host contents lines (<code>ContainerContents</code>), not placed units.</p> : receptacle.units.length ? <FitList fits={receptacle.units} side="unit" /> : <p>No declared catalog unit fits yet.</p>}
          {receptacle.patterns.length > 0 && <p>Load patterns, one per layer: {receptacle.patterns.map(pattern => `${pattern.name} (${pattern.units} units, ${pattern.id})`).join('; ')}.</p>}
        </div>)}
      </>}
    </>}
  </section>;
}

function FitList({ fits, side }: { fits: readonly HandlingFit[]; side: 'container' | 'unit' }) {
  return <ul className="object-handling-list">{fits.map(fit => <li key={`${fit.unit}:${fit.container}:${fit.receptacle}`}>
    <ObjectLink asset={side === 'container' ? fit.container : fit.unit} />
    {fit.verdict === 'fits' ? <span> · {side === 'container' ? fitDetail(fit) : fitConditions(fit).join(' · ') || 'fits'}</span> : <span> · too large: {fit.message}</span>}
  </li>)}</ul>;
}
