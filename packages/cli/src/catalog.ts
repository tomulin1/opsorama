import type { AssetNode } from '@opsorama/core';
import { assetDescriptors, catalogKitAssets, CATALOG_KITS } from '@opsorama/objects';

/** One catalog model in a search result: where it comes from and what it is. */
export interface CatalogEntry {
  asset: string;
  name: string;
  category: string;
  purpose: string;
  kit: string;
  /** Subpath to import the kit from, for example `@opsorama/objects/vehicles`. */
  import: string;
  /** Name of the kit registry exported from that subpath, for example `vehiclesKit`. */
  export: string;
}

const DOCS_ORIGIN = 'https://opsorama.dev';
const kitExport = (kit: string) => `${kit.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}Kit`;
const kitOf = new Map(CATALOG_KITS.flatMap(kit => catalogKitAssets[kit].map(asset => [asset, kit] as const)));

/** Every catalog model with its kit, in kit order. */
export function catalogEntries(): CatalogEntry[] {
  return CATALOG_KITS.flatMap(kit => catalogKitAssets[kit].map(asset => {
    const descriptor = assetDescriptors[asset];
    return { asset, name: descriptor?.name ?? asset, category: descriptor?.category ?? '', purpose: descriptor?.purpose ?? '', kit, import: `@opsorama/objects/${kit}`, export: kitExport(kit) };
  }));
}

/**
 * Catalog models matching every word of `query` in their asset name, display name, category, purpose or kit, best match
 * first (asset and display names weigh most). An empty query lists every model. `kit` limits the search to one kit.
 */
export function searchCatalog(query: string, { kit, limit = 20 }: { kit?: string; limit?: number } = {}): CatalogEntry[] {
  if (kit !== undefined && !CATALOG_KITS.includes(kit as typeof CATALOG_KITS[number])) throw new Error(`Unknown kit: ${kit}. Kits: ${CATALOG_KITS.join(', ')}.`);
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const scored = catalogEntries().filter(entry => !kit || entry.kit === kit).map(entry => {
    const fields: [string, number][] = [[entry.asset, 8], [entry.name.toLowerCase(), 6], [entry.kit, 3], [entry.category.toLowerCase(), 3], [entry.purpose.toLowerCase(), 1]];
    let score = 0;
    for (const word of words) {
      const hits = fields.filter(([text]) => text.includes(word));
      if (!hits.length) return { entry, score: -1 };
      score += Math.max(...hits.map(([text, weight]) => weight * (text === word || text.split(/[\s-]+/).includes(word) ? 2 : 1)));
    }
    return { entry, score };
  }).filter(item => item.score >= 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit)).map(item => item.entry);
}

/** The closest catalog asset name to `asset`, when it is a likely typo. */
function closestAsset(asset: string): string | undefined {
  let best: string | undefined, bestDistance = Infinity;
  for (const name of kitOf.keys()) {
    let previous = Array.from({ length: name.length + 1 }, (_, index) => index);
    for (let i = 1; i <= asset.length; i++) {
      const row = [i];
      for (let j = 1; j <= name.length; j++) row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (asset[i - 1] === name[j - 1] ? 0 : 1));
      previous = row;
    }
    if (previous[name.length] < bestDistance) { best = name; bestDistance = previous[name.length]; }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(Math.max(asset.length, best.length) / 3)) ? best : undefined;
}

/** Everything an agent needs to place one catalog model: its kit and import, its descriptor and a minimal valid node. */
export interface AssetDetails extends CatalogEntry {
  /** The model's `ObjectDescriptor`: geometry, palette roles, customization fields and options, states, motion, anchors, slots and limits. */
  descriptor: (typeof assetDescriptors)[string];
  /** A minimal asset node that passes `opsorama check`. */
  example: AssetNode;
  /** The model's page on the website. */
  docs: string;
}

/** Details of one catalog model; throws with the closest name for an unknown asset. */
export function describeAsset(asset: string): AssetDetails {
  const kit = kitOf.get(asset), descriptor = assetDescriptors[asset];
  if (!kit || !descriptor) {
    const near = closestAsset(asset.toLowerCase());
    throw new Error(`Unknown catalog asset: ${asset}.${near ? ` Did you mean ${near}?` : ''} Find models with: opsorama catalog search <words>`);
  }
  const entry = catalogEntries().find(item => item.asset === asset)!;
  return { ...entry, descriptor, example: { id: `${asset}-1`, kind: 'asset', asset, position: [0, 0, 0] }, docs: `${DOCS_ORIGIN}/docs/objects/${asset}` };
}

/** A search result as text: one line per model with its kit import. */
export function formatEntries(entries: readonly CatalogEntry[]): string {
  if (!entries.length) return 'No catalog model matches. Try fewer or other words, or opsorama catalog search with no words to list every model.';
  const width = Math.max(...entries.map(entry => entry.asset.length));
  return entries.map(entry => `${entry.asset.padEnd(width)}  ${entry.name} (${entry.category}). ${entry.purpose}  [${entry.export} from ${entry.import}]`).join('\n');
}

const metres = (value: number) => `${Math.round(value * 100) / 100}`;

/** One model as readable text: import, size, node fields and options, anchors, slots, palette roles, states, motion, limits and an example node. */
export function formatAsset(details: AssetDetails): string {
  const { descriptor: d } = details, lines: string[] = [];
  lines.push(`${details.asset}: ${details.name} (${details.category})`, d.purpose, '');
  lines.push(`Import: import { ${details.export} } from '${details.import}';  (or catalogAssets from '@opsorama/objects')`);
  const { min, max } = d.geometry.bounds;
  lines.push(`Size: ${metres(max[0] - min[0])} × ${metres(max[1] - min[1])} × ${metres(max[2] - min[2])} m (width × height × depth); pivot ${d.geometry.pivot}, forward ${d.geometry.forward}, up ${d.geometry.up}`, '');
  lines.push('Node fields and options:');
  for (const field of d.customization) lines.push(`  ${field.field}: ${field.type}; default ${field.default}. ${field.description}`);
  const { anchors, slots } = d.interaction;
  if (anchors?.length) lines.push('', 'Anchors (AssetNode.attachment.anchor):', ...anchors.map(anchor => `  ${anchor.name}: ${anchor.purpose}`));
  if (slots?.length) lines.push('', `Interaction slots: ${slots.join(', ')}`);
  lines.push('', 'Palette roles (SceneSettings.palette or AssetNode.materials):', ...d.palette.roles.map(role => `  ${role.role}: ${role.parts}`));
  lines.push('', `States: shown ${d.states.shown.join(', ')}${d.states.unchanged.length ? `; unchanged ${d.states.unchanged.join(', ')}` : ''}. ${d.states.parts}`);
  lines.push(`Motion: ${d.motion.animation}. ${d.motion.staticPose}`);
  if (d.evidence.limits.length) lines.push('', 'Limits:', ...d.evidence.limits.map(limit => `  - ${limit}`));
  lines.push('', 'Example node:', `  ${JSON.stringify(details.example)}`, '', `Docs: ${details.docs}  (or: opsorama docs objects/${details.asset})`);
  return lines.join('\n');
}
