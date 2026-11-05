/**
 * Asset ids built on the shared person rig: the generic `worker` and the clothed characters. They share the worker
 * poses (`variant`), anchors and animation, and they are the only assets that accept `AssetNode.person`.
 */
export const PERSON_ASSETS = Object.freeze(['worker', 'office-worker', 'chef', 'doctor', 'nurse', 'security-guard', 'construction-worker', 'visitor'] as const);
export type PersonAsset = typeof PERSON_ASSETS[number];
export const isPersonAsset = (asset: string): asset is PersonAsset => (PERSON_ASSETS as readonly string[]).includes(asset);

/**
 * Body silhouette of a person. `feminine` is a smaller, slimmer build (about 1.67 m instead of 1.74 m) with
 * narrower shoulders and waist, hides the ears under hair, replaces the short hair cap with one-piece
 * long hair that falls to the shoulders and, for the visitor and office worker, adds a knee-length skirt instead of
 * trousers. Poses, anchor names and the 0.52 m seat height are the same for both figures; hand and carry anchors
 * follow the smaller body.
 */
export const PERSON_FIGURES = Object.freeze(['masculine', 'feminine'] as const);
export type PersonFigure = typeof PERSON_FIGURES[number];
/** Person assets only (`PERSON_ASSETS`). */
export interface PersonOptions {
  /** Body silhouette and hair length. Default: `masculine`. Changing it rebuilds the model. */
  figure?: PersonFigure;
}
export function validatePersonOptions(options: PersonOptions): void {
  if (typeof options !== 'object' || options === null) throw new Error('Person options must be an object such as { figure: \'feminine\' }.');
  const unknown = Object.keys(options).filter(key => key !== 'figure');
  if (unknown.length) throw new Error(`Unknown person option ${unknown.join(', ')}; person accepts only figure.`);
  if (options.figure !== undefined && !(PERSON_FIGURES as readonly string[]).includes(options.figure)) throw new Error(`Unknown person figure: ${String(options.figure)}. Use one of ${PERSON_FIGURES.join(', ')}.`);
}

/**
 * Preset hair colors for the `hair` palette role. Set one with `materials: { hair: PERSON_HAIR_COLORS.blonde }`;
 * `dark` matches the default theme. Any #RRGGBB color still works; these presets only keep scenes consistent.
 */
export const PERSON_HAIR_COLORS = Object.freeze({ dark: '#3a3c43', brown: '#6b4a32', blonde: '#d8b46a', red: '#a4472a' } as const);
export type PersonHairColor = keyof typeof PERSON_HAIR_COLORS;
/**
 * A stable preset hair color for a person id, so a crowd shows all presets without random changes between renders.
 * The same id always returns the same color.
 */
export function personHairColor(id: string): string {
  const presets = Object.values(PERSON_HAIR_COLORS), hash = [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  return presets[hash % presets.length];
}
