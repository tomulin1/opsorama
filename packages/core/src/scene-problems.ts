/**
 * Problem reports of scene validation: the rule catalog, the problem record and the error the throwing validators raise.
 * `validateScene` (validate-scene.ts) returns problems; `validateNode`, `createSceneStore` and the other `validate*`
 * functions throw `SceneValidationError` with the same problems.
 */

/**
 * Every rule `validateScene` checks, with a one-line description. Rule IDs are stable: tools and agents may match on
 * them, so a rule is only ever added, never renamed. All rules report errors except `unknown-key`, which warns.
 */
export const SCENE_RULES = /* @__PURE__ */ Object.freeze({
  'scene-object': 'The scene definition is an object { schemaVersion: 1, nodes: [...] }.',
  'schema-version': 'schemaVersion is 1, the only supported version.',
  'nodes-array': 'nodes is an array of scene node objects.',
  'node-object': 'Every entry of nodes is a plain object.',
  'node-id': 'Every node has a nonempty string id.',
  'duplicate-id': 'Node IDs are unique within the scene.',
  'node-kind': 'kind is one of ground, zone, asset, path, marker, shape, line, group, text, image.',
  'unknown-key': 'A key that is not a documented field of its object is ignored (warning); it is usually a typo.',
  'field-type': 'A field has its documented JSON type: string, boolean or number.',
  'allowed-value': 'An enumerated field (labelMode, state, view, countLayout, align) uses one of its documented values.',
  'transform': 'position, rotation and scale are [x, y, z] arrays of three finite numbers.',
  'size': 'The size of a ground or zone node is [width, depth] in positive finite metres.',
  'path-points': 'A path node has at least two [x, y, z] points of finite numbers.',
  'asset-name': 'An asset node names its model in a nonempty asset string.',
  'asset-options': 'Asset options are a plain object of JSON-like data: no functions, class instances, cycles, NaN or Infinity.',
  'asset-validator': 'The asset factory accepts the node: a registered asset name and the options and values it supports. Checked only with the validateAsset option.',
  'materials': 'Material overrides use known material roles with #RRGGBB colors.',
  'footprint': 'A footprint is [width, depth] in positive finite metres.',
  'count': 'count is a non-negative safe integer, multiplier a positive safe integer, and their product a safe integer.',
  'interior': 'interior is a boolean, and true only on a top-level ground, zone or sized surface asset with a footprint.',
  'marker': 'Marker fields (label, shape, tone, icon, markerSize, color, eyebrow, detail, pulse) have valid values.',
  'route': 'A route has 2–512 finite points, a speed in range and valid segment speeds, stops, headings, loop and motion profile.',
  'controller': 'A controller has a nonempty kind and options of plain JSON data with finite numbers.',
  'transfer': 'A transfer has seconds from 0.05 to 5 and an optional arc from 0 to 2 m.',
  'motion-owner': 'Only asset, shape and group nodes have a route or a controller, and such a node has at most one of the two.',
  'shape': "A shape node's shape is a box with three positive sizes, a sphere with a positive radius, or a cylinder with radii of 0 or more (not both 0) and a positive height, in metres.",
  'opacity': 'The opacity of a shape node is a number from 0 to 1.',
  'line-points': 'A line node has at least two [x, y, z] points of finite numbers.',
  'line-width': 'The width of a line node is a number of metres from 0 to 5.',
  'text': 'A text node has a text of 1 to 500 characters with at least one visible character.',
  'text-size': 'The size of a text node (capital letter height) is a number of metres from 0.05 to 20.',
  'image-src': 'An image node has a src that is a relative, http:, https:, blob: or data:image/ URL of at most 1,000,000 characters, without control characters or surrounding spaces.',
  'image-size': 'An image node has a size of [width, height] in metres, each greater than 0 and at most 100.',
  'parent-id': 'A parentId is the nonempty ID of another node.',
  'parent-kind': 'A parentId names an asset or group node; only assets and groups contain children.',
  'parent-cycle': 'parentId chains do not form a cycle.',
  'attachment': 'An attachment names the carrying node in nodeId and, when given, a nonempty anchor.',
  'attachment-conflict': 'A node has an attachment or a parentId, not both, and an attached asset, shape or group owns no route or controller.',
  'attachment-cycle': 'Chains of attachments do not form a cycle.',
} as const);

/** Stable ID of a scene validation rule; see `SCENE_RULES`. */
export type SceneRule = keyof typeof SCENE_RULES;

/** One problem found by `validateScene` or a throwing validator. */
export interface SceneProblem {
  /**
   * JSON Pointer (RFC 6901) to the offending value, relative to the validated input: `/nodes/3/route/speed` for
   * `validateScene` and the store, `/route/speed` for `validateNode`. The empty string points at the input itself.
   */
  path: string;
  /** Stable rule ID; `SCENE_RULES[rule]` describes it. */
  rule: SceneRule;
  /** `error` makes the scene invalid: the store rejects it. `warning` (only `unknown-key`) is ignored at runtime. */
  severity: 'error' | 'warning';
  /** What is wrong, naming the node where one is known. */
  message: string;
  /** What to change to resolve the problem. */
  fix: string;
  /** ID of the node the problem belongs to, when the node has a string id. */
  nodeId?: string;
}

/**
 * Thrown by `createSceneStore`, `SceneStore.replace` and `upsert`, `validateNode` and the other `validate*` functions
 * of `@opsorama/core`. `message` is the message of the first error; `problems` lists every problem found in the same
 * pass, errors and warnings, in document order.
 */
export class SceneValidationError extends Error {
  readonly problems: readonly SceneProblem[];
  constructor(problems: readonly SceneProblem[]) {
    const first = problems.find(problem => problem.severity === 'error') ?? problems[0];
    super(first ? first.message : 'Invalid scene.');
    this.name = 'SceneValidationError';
    this.problems = Object.freeze(problems.map(problem => Object.freeze({ ...problem })));
  }
}

/** Internal: records one problem. Severity defaults to `error`. */
export type AddProblem = (path: string, rule: SceneRule, message: string, fix: string, severity?: SceneProblem['severity']) => void;

/** Internal: runs `check` with a recorder and returns the problems it recorded, tagged with `nodeId` when given. */
export function collectProblems(check: (add: AddProblem) => void, nodeId?: string): SceneProblem[] {
  const problems: SceneProblem[] = [];
  check((path, rule, message, fix, severity = 'error') => { problems.push({ path, rule, severity, message, fix, ...(nodeId !== undefined ? { nodeId } : {}) }); });
  return problems;
}

/** Internal: throws `SceneValidationError` when `problems` contains an error; warnings alone pass. */
export function throwOnErrors(problems: readonly SceneProblem[]): void {
  if (problems.some(problem => problem.severity === 'error')) throw new SceneValidationError(problems);
}

/** Internal: appends reference tokens to a JSON Pointer, escaping `~` and `/` as RFC 6901 requires. */
export function pointer(base: string, ...tokens: (string | number)[]): string {
  return base + tokens.map(token => `/${String(token).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
