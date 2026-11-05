import type { AssetNode } from '@opsorama/core';
import { movementFacts } from './object-movement';

/** Interaction slots and the catalog motion profile of the previewed object; renders nothing when it has neither. */
export function ObjectMovement({ node }: { node: AssetNode }) {
  const { slots, profile } = movementFacts(node);
  if (!slots.length && !profile) return null;
  return <section className="object-contract object-movement" aria-labelledby="object-movement-title">
    <h2 id="object-movement-title">Movement and interaction</h2>
    {slots.length > 0 && <>
      <p>Interaction slots where behavior agents use this object (<code>assetInteractionSlots[&apos;{node.asset}&apos;]</code>), in local metres: x and z from the base-center pivot, heading 0° facing +z. Each slot holds one agent; slots in a group share a purpose. Resolve them with <code>resolveSceneSlots</code> and connect each approach with <code>slotNavPoints</code>; slot IDs are <code>nodeId:name</code>.</p>
      <table className="object-movement-slots"><thead><tr><th scope="col">Slot</th><th scope="col">Group</th><th scope="col">Pose</th><th scope="col">Heading</th><th scope="col">Position x, z</th><th scope="col">Approach x, z</th><th scope="col">Agents</th></tr></thead>
        <tbody>{slots.map(slot => <tr key={slot.name}><td><code>{slot.name}</code></td><td>{slot.group}</td><td>{slot.pose}</td><td>{slot.heading}</td><td>{slot.position}</td><td>{slot.approach}</td><td>{slot.agents}</td></tr>)}</tbody>
      </table>
    </>}
    {profile && <>
      <p>Catalog motion profile (<code>assetMotionProfiles[&apos;{node.asset}&apos;]</code>): visual defaults at dashboard scale, not vehicle specifications. Spread it into a movement graph&apos;s <code>agents</code> and override any field, e.g. <code>{`agents: { vehicle: { ...assetMotionProfiles['${node.asset}'], speed: 2 } }`}</code>.</p>
      <table><tbody>{profile.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
    </>}
  </section>;
}
