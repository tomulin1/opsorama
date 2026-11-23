import type { MaterialOverrides, SceneNode } from '@opsorama/core';

/*
 * Build signatures of scene nodes for the scene renderer: a node is built again only when its signature changes. Internal
 * to the package.
 */

/** Kinds whose built object takes theme and palette colors. A marker element takes palette colors only. */
const THEMED_KINDS: ReadonlySet<SceneNode['kind']> = new Set(['asset', 'shape', 'line', 'text', 'image']);

/**
 * What the built object of `node` depends on apart from its containment: every field except `position` and `route`
 * (applied without a rebuild), plus the theme and palette (`paletteKey`, a serialized palette) for kinds drawn with them.
 */
export function nodeSignature(node: SceneNode, theme: string, paletteKey: string): string {
  const presentation = node.kind === 'marker' ? { materialPalette: paletteKey } : THEMED_KINDS.has(node.kind) ? { paletteTheme: theme, materialPalette: paletteKey } : {};
  return JSON.stringify({ ...node, position: undefined, route: undefined, ...presentation });
}

/**
 * Signatures of scene nodes, computed once per node object. Store nodes are immutable and `upsert` keeps the objects of
 * unchanged nodes, so after a change only the changed nodes are serialized again. Containment is not part of the cached
 * value: it depends on other nodes and is added by the caller.
 */
export interface NodeSignatureCache {
  /** The signature of `node` under the current theme and palette; see `nodeSignature`. */
  get(node: SceneNode): string;
  /**
   * Sets the theme and palette signatures include. A change of either (the palette compared by value) drops every cached
   * signature, so each node is serialized again once. Returns whether they changed.
   */
  present(theme: string, palette: MaterialOverrides | undefined): boolean;
  /** Signatures computed since the cache was created: one per new or changed node object, every node after `present` changed. */
  readonly computed: number;
}

export function createNodeSignatureCache(): NodeSignatureCache {
  let signatures = new WeakMap<SceneNode, string>(), theme: string | null = null, palette: MaterialOverrides | undefined, paletteKey = '', computed = 0;
  return {
    get(node) {
      let signature = signatures.get(node);
      if (signature === undefined) { signature = nodeSignature(node, theme ?? '', paletteKey); signatures.set(node, signature); computed++; }
      return signature;
    },
    present(nextTheme, nextPalette) {
      // Settings re-freeze the palette on every change, so an equal palette is usually a new object.
      const nextKey = nextPalette === palette ? paletteKey : nextPalette ? JSON.stringify(nextPalette) : '';
      palette = nextPalette;
      if (nextTheme === theme && nextKey === paletteKey) return false;
      theme = nextTheme; paletteKey = nextKey; signatures = new WeakMap();
      return true;
    },
    get computed() { return computed; },
  };
}
