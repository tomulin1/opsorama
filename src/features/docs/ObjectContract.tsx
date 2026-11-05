import type { Bounds, ObjectDescriptor } from '@opsorama/core';

const size = (bounds: Bounds) => bounds.max.map((value, axis) => (value - bounds.min[axis]).toFixed(2)).join(' × ');
const sample = (value: object) => JSON.stringify(value).replace(/"/g, '');

/** Renders the runtime descriptor, so the catalog and the code share one contract. */
export function ObjectContract({ descriptor }: { descriptor: ObjectDescriptor }) {
  const { geometry, palette, customization, states, motion, interaction, lifecycle, evidence } = descriptor;
  const rows: Readonly<Record<string, React.ReactNode>> = {
    'Geometry': <>{geometry.units === 'metres' ? 'Metres' : 'Process scale'}, Y-up, front +z, {geometry.pivot === 'stance' ? 'stance pivot (the floor point under the body)' : geometry.pivot === 'model-origin' ? 'preserved model origin (see placement note)' : 'base-center pivot'}. Default {size(geometry.bounds)} m{geometry.largest ? <>; largest {size(geometry.largest.bounds)} m ({sample(geometry.largest.node)})</> : null}. {geometry.pivot === 'model-origin' && <>Origin-relative bounds: [{geometry.bounds.min.join(', ')}] to [{geometry.bounds.max.join(', ')}] m. </>}{geometry.note}</>,
    'Palette roles': <ul>{palette.roles.map(use => <li key={use.role}><code>{use.role}</code> {use.parts}{use.when ? <> (with {sample(use.when)})</> : null}</li>)}</ul>,
    'Legacy color': palette.colorRole ? <>Sets <code>{typeof palette.colorRole === 'string' ? palette.colorRole : palette.colorRole.join(', ')}</code>; <code>materials</code> wins. {palette.fixed}</> : <>Not supported. {palette.fixed}</>,
    'Customization': <ul>{customization.map(option => <li key={option.field}><code>{option.field}</code> {option.type}, default {option.default}, {option.update === 'rebuild' ? 'rebuilds' : 'no rebuild'}: {option.description}</li>)}</ul>,
    'States': <>Shown: {states.shown.join(', ')}. No change: {states.unchanged.join(', ') || 'none'}. {states.parts} {states.alternative}</>,
    'Motion': <>{motion.animation === 'none' ? 'No built-in animation.' : 'Built-in local animation.'} {motion.staticPose} {motion.transform} {motion.policy}</>,
    'Interaction': <>{interaction.selectable} {interaction.hit} Anchors: {interaction.anchors.length ? interaction.anchors.map(anchor => <span key={anchor.name}><code>{anchor.name}</code> {anchor.purpose}{anchor.when ? <> (with {anchor.when.map(sample).join(' or ')})</> : null} </span>) : 'none. '}{interaction.slots.length ? <>Slots in the default configuration: {interaction.slots.join(', ')}. </> : null}{interaction.relationships}</>,
    'Lifecycle': <>Instance-owned resources. {lifecycle.textures} {lifecycle.update} {lifecycle.disposal}</>,
    'Evidence': <>Examples: {evidence.examples.join(', ')}. Checks: {evidence.tests.join(', ')}. Limits: {evidence.limits.join(' ')}</>,
  };
  return <section className="object-contract" aria-labelledby="object-contract-title">
    <h2 id="object-contract-title">Object contract</h2>
    <p>This definition implements the common object contract. The table below is the runtime descriptor (<code>assetDescriptors.{descriptor.asset}</code>), checked against the built model by <code>checkAssetDescriptor</code>.</p>
    <table><tbody>{Object.entries(rows).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
  </section>;
}
