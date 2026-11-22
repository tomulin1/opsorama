import type { SceneNode } from './index';
import { collectProblems, throwOnErrors } from './scene-problems';
import { attachmentProblems, transferChecks } from './validate-scene';
/** A child owns its resources and identity; its transform is local to the parent's named anchor. */
export interface Attachment {
  /**
   * ID of the carrying node.
   * @minLength 1
   * @pattern \S
   */
  nodeId: string;
  /**
   * Named anchor of the carrier's model, such as a carry or fork anchor. Default: the carrier's origin.
   * @minLength 1
   * @pattern \S
   */
  anchor?: string;
}
/**
 * Throws `SceneValidationError` when a node has both an attachment and a parentId, an attached asset owns a route or a
 * controller, or attachments form a cycle. Problem paths are relative to `nodes` (`/3/attachment`).
 */
export function validateAttachments(nodes: readonly SceneNode[]): void {
  throwOnErrors(attachmentProblems(nodes, ''));
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
  /**
   * Visual seconds, 0.05–5.
   * @minimum 0.05
   * @maximum 5
   */
  seconds: number;
  /**
   * Peak lift in metres, 0–2. Default 0.25.
   * @minimum 0
   * @maximum 2
   */
  arc?: number;
}
export const DEFAULT_TRANSFER_ARC = .25;

/** Throws `SceneValidationError` unless `seconds` is 0.05–5 and `arc`, when given, 0–2. */
export function validateNodeTransfer(transfer: NodeTransfer): void {
  throwOnErrors(collectProblems(add => transferChecks(transfer, '', add)));
}
