import type { SceneNode } from './index';
/** A child owns its resources and identity; its transform is local to the parent's named anchor. */
export interface Attachment { nodeId: string; anchor?: string; }
export function validateAttachments(nodes: readonly SceneNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    if (node.attachment && node.parentId) throw new Error('An attachment cannot also have a building parent.');
    if (node.attachment && node.kind === 'asset' && node.route) throw new Error('Attached assets cannot own a route.');
    if (node.attachment && node.kind === 'asset' && node.controller) throw new Error('Attached assets cannot own a controller.');
    const seen = new Set([node.id]); let current: SceneNode | undefined = node;
    while (current) {
      const id: string | undefined = current.attachment?.nodeId ?? current.parentId;
      if (!id) break;
      if (seen.has(id)) throw new Error(`Attachment cycle at ${node.id}.`);
      seen.add(id); current = byId.get(id);
    }
  }
}

/**
 * Animation of a node that changes `attachment` or `parentId`, e.g. a parcel
 * handed from a shelf to a picker. The new placement is authoritative at once;
 * the renderer moves the node from its previous world pose to the new one over
 * `seconds` of the visual clock (speed and pause apply), lifting it up to `arc`
 * metres midway. Motion-off and reduced motion skip the animation. A node that
 * first appears, or keeps its parent, does not animate.
 */
export interface NodeTransfer {
  /** Visual seconds, 0.05–5. */
  seconds: number;
  /** Peak lift in metres, 0–2. Default 0.25. */
  arc?: number;
}
export const DEFAULT_TRANSFER_ARC = .25;

export function validateNodeTransfer(transfer: NodeTransfer): void {
  if (!transfer || typeof transfer !== 'object') throw new Error('Node transfer must be an object.');
  if (!(Number.isFinite(transfer.seconds) && transfer.seconds >= .05 && transfer.seconds <= 5)) throw new Error('Node transfer seconds must be from 0.05 to 5.');
  if (transfer.arc !== undefined && !(Number.isFinite(transfer.arc) && transfer.arc >= 0 && transfer.arc <= 2)) throw new Error('Node transfer arc must be from 0 to 2 m.');
}
