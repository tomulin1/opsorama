import type { SceneSnapshot } from '@opsorama/core';

/**
 * Host examples inspect the record represented by a composed alert marker.
 * Picking still selects the marker node; inspectors and list highlights resolve
 * an attached map pin to its owning scene node. Standalone pins keep their ID.
 */
export function exampleSelectionNodeId(scene: SceneSnapshot): string | null {
  const id = scene.selection?.nodeId;
  if (!id) return null;
  const node = scene.nodes.find(node => node.id === id);
  return node?.kind === 'asset' && node.asset === 'map-pin' && node.attachment ? node.attachment.nodeId : id;
}
