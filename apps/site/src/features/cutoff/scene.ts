import type { SceneNode } from '@opsorama/core';
import type { AreaId } from '../ecommerce/model';
import type { StaffMember, StaffZone } from '../ecommerce/simulation';

/** The process area that stands for each zone a person can be sent to. */
export const ZONE_AREAS: Readonly<Partial<Record<StaffZone, AreaId>>> = { packing: 'packing', replenishing: 'picking', restocking: 'shop' };
export const ZONE_LABELS: Readonly<Record<StaffZone, string>> = { picking: 'Picking', sorting: 'Sorting', packing: 'Packing', replenishing: 'Replenishing', restocking: 'Shop restocking', dispatch: 'Dispatch' };

/** The zone a clicked node sends a person to: its area or pin, a packing bench, a pick face or a gondola. */
export function zoneAt(nodeId: string): StaffZone | null {
  const [kind, id] = nodeId.split(':');
  if (kind === 'area' || kind === 'pin') return (Object.entries(ZONE_AREAS) as [StaffZone, AreaId][]).find(([, area]) => area === id)?.[0] ?? null;
  if (kind === 'pack') return 'packing';
  if (kind === 'flow' || kind === 'shelf') return 'replenishing';
  if (kind === 'gondola') return 'restocking';
  return null;
}

/** People who can change zone; the player selects them in the scene. */
export const movable = (person: StaffMember | undefined) => !!person && person.zones.length > 1;

/**
 * The game's view of the scene: every movable person is selectable, and while one
 * is selected the area pins they can go to are marked and named, and the others are dimmed.
 */
export function gameNodes(nodes: readonly SceneNode[], staff: readonly StaffMember[], selected: string | null): SceneNode[] {
  const people = new Set(staff.filter(movable).map(person => person.id)), person = staff.find(item => item.id === selected && movable(item));
  const targets = new Map(person ? person.zones.filter(zone => zone !== person.zone).flatMap(zone => ZONE_AREAS[zone] ? [[ZONE_AREAS[zone]!, zone] as const] : []) : []);
  return nodes.map(node => {
    if (people.has(node.id) && node.kind === 'asset') return { ...node, selectable: true };
    if (person && node.kind === 'asset' && node.id.startsWith('pin:')) {
      const zone = targets.get(node.id.slice(4) as AreaId);
      return zone ? { ...node, state: 'busy', label: `Send here · ${ZONE_LABELS[zone]}` } : { ...node, state: 'inactive' };
    }
    return node;
  });
}
