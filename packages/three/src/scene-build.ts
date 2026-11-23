import * as THREE from 'three';
import type { SceneNode } from '@opsorama/core';
import { disposeObject } from './assets';
import { applyShadowPolicy } from './shadows';
import { mergeStaticParts } from './static-merge';

/*
 * Per-node building and parenting for the scene renderer, kept apart so that one failing node never stops the rest of
 * the scene. Internal to the package.
 */

const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error));

/** The object built for a node, or an empty stand-in with the reason the node could not be built. */
export interface SceneObjectBuild { object: THREE.Object3D; error: Error | null }

/** The error reported for a node whose factory or build failed; the original error is its `cause`. */
export function nodeBuildError(nodeId: string, error: unknown): Error {
  const cause = toError(error);
  const message = `Scene node "${nodeId}" could not be built: ${cause.message} It stays empty until the node changes;`
    + ' fix the node or its asset factory.';
  return new Error(message, { cause });
}

/**
 * Builds the object of `node` for the scene: the model from `build`, then the shadow policy (`interior` for a contained
 * node) and merged static parts. When any step throws, the partly built model is released and an empty `Group` takes its
 * place, so the node keeps its transform, its children keep a parent and the rest of the scene still renders; `error`
 * then names the node.
 */
export function buildSceneObject(node: SceneNode, contained: boolean, build: (node: SceneNode) => THREE.Object3D): SceneObjectBuild {
  let object: THREE.Object3D | null = null;
  try {
    object = build(node);
    applyShadowPolicy(object, { interior: contained });
    mergeStaticParts(object);
    return { object, error: null };
  } catch (error) {
    if (object) disposeObject(object);
    return { object: new THREE.Group(), error: nodeBuildError(node.id, error) };
  }
}

/**
 * Detaches the objects of other scene nodes from the subtree of `object` and returns them: its child and attached nodes,
 * which own their resources, so that `object` can be disposed without them. A node object is recognized by a
 * `userData.nodeId` other than that of `object`; the walk does not enter it, so it visits only the objects `object` owns
 * and is linear in the size of its own model.
 */
export function detachChildNodes(object: THREE.Object3D): THREE.Object3D[] {
  const owner = object.userData.nodeId, found: THREE.Object3D[] = [];
  const visit = (current: THREE.Object3D) => {
    for (const child of current.children) {
      const id = child.userData.nodeId;
      if (id !== undefined && id !== owner) found.push(child); else visit(child);
    }
  };
  visit(object);
  for (const child of found) child.removeFromParent();
  return found;
}

/** The error reported for an attachment to an anchor that the owner's model does not have. */
export function attachmentAnchorError(nodeId: string, ownerId: string, anchor: string): Error {
  return new Error(`Scene node "${nodeId}" is attached to anchor "${anchor}" of "${ownerId}", but that model has no`
    + ` such anchor. The node is placed at the origin of "${ownerId}" instead; use an anchor the model declares.`);
}

/**
 * Where the object of `node` belongs: the named anchor of its attachment owner, the owner itself, its `parentId`
 * container, or `root` for a top-level node. `objectOf` returns the built object of a node ID. `parent` is undefined
 * while the owner or container is not built. When the owner has no object named `anchor-<name>`, the node goes to the
 * owner itself and `missingAnchor` names the anchor.
 */
export function nodeParent(
  node: SceneNode, objectOf: (id: string) => THREE.Object3D | undefined, root: THREE.Object3D,
): { parent: THREE.Object3D | undefined; missingAnchor: string | null } {
  const attachment = node.attachment;
  if (!attachment) return { parent: node.parentId ? objectOf(node.parentId) : root, missingAnchor: null };
  const owner = objectOf(attachment.nodeId);
  if (!owner || !attachment.anchor) return { parent: owner, missingAnchor: null };
  const anchor = owner.getObjectByName(`anchor-${attachment.anchor}`);
  return anchor ? { parent: anchor, missingAnchor: null } : { parent: owner, missingAnchor: attachment.anchor };
}
