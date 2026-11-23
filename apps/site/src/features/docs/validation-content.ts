import { SCENE_RULES } from '@opsorama/core';
import type { DocArticle } from './content';

/** Scene validation: validateScene, its problem records and rules, store errors and the published JSON Schema. */
export const validationArticle: DocArticle = {
  slug: 'validation', title: 'Scene validation', category: 'FOUNDATIONS',
  description: 'Check a scene definition before it reaches the store or the renderer: validateScene reports every problem with its JSON Pointer path, a stable rule ID and a fix, and a published JSON Schema covers editors and other tools.',
  sections: [
    { id: 'validate', title: 'Check a scene in one pass', paragraphs: [
      'validateScene(input, options?) from @opsorama/core checks a scene definition and returns every problem it finds, without throwing. input may be anything, such as parsed JSON, generated code or a file written by an agent. An empty array means the store accepts the scene. It runs without a browser, so it fits tests, build scripts and servers.',
      'Pass the same validateAsset as the store, usually assetValidator(registry) from @opsorama/three, to also check asset names against the registry and each model\'s options. Asset factories run only on asset nodes without other errors, so they never see malformed data.',
    ], code: `import { validateScene } from '@opsorama/core';
import { assetValidator, createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';

const assets = createAssetRegistry(workItemsKit);
const problems = validateScene(JSON.parse(sceneText), { validateAsset: assetValidator(assets) });
for (const problem of problems) {
  console.log(\`\${problem.severity} \${problem.path} [\${problem.rule}] \${problem.message} Fix: \${problem.fix}\`);
}`, language: 'typescript' },
    { id: 'problems', title: 'Read a problem', paragraphs: ['Each problem is a plain object. Problems are listed in document order: the root, then each node with its own fields, then relations between nodes (unique IDs, parents and attachments). For the scene below, with a typo in one key, a two-number position, a ground used as a container and an option the parcel does not accept, validateScene returns four problems.'], headers: ['Field', 'Meaning'], rows: [
      ['path', 'JSON Pointer (RFC 6901) to the value, relative to the input, for example /nodes/2/position. An empty string points at the input itself.'],
      ['rule', 'Stable rule ID from SCENE_RULES. Match on it in tools; it is never renamed.'],
      ['severity', 'error makes the scene invalid and the store rejects it. warning (only unknown-key) is ignored at runtime.'],
      ['message', 'What is wrong, naming the node.'],
      ['fix', 'What to change, with the expected format or allowed values.'],
      ['nodeId', 'ID of the node the problem belongs to, when the node has a string id.'],
    ] },
    { id: 'example', title: 'Example output', paragraphs: ['Input nodes: a ground floor; order-1 with positon instead of position; order-2 with position [2, 0.08] and parentId floor; order-3 with options.forks. The output, one problem per line:'], code: `warning /nodes/1/positon [unknown-key] Unknown key "positon" on asset node order-1; it is ignored. Fix: Did you mean "position"? Otherwise remove "positon". Model-specific settings belong in options.
error /nodes/2/position [transform] Invalid transform for order-2. Fix: Set position to [x, y, z] with three finite numbers (metres), received [2,0.08].
error /nodes/3/options [asset-validator] Asset parcel does not accept options.forks (node order-3). It is accepted by forklift, reach-truck; remove options.forks or use one of those assets. Fix: Change the node so its asset factory accepts it: ...
error /nodes/2/parentId [parent-kind] Parent floor of order-2 must be an asset node; it is a ground node. Only assets can contain children. Fix: Set parentId to the id of an asset node, or remove it. ...`, language: 'text' },
    { id: 'rules', title: 'Rules', paragraphs: ['SCENE_RULES maps every rule ID to a one-line description. Every rule reports an error except unknown-key, which warns: keys outside the documented fields are ignored by the renderer and are usually a typo, so the warning names the nearest known key.'], headers: ['Rule', 'Checks'], rows: Object.entries(SCENE_RULES).map(([rule, description]) => [rule, description]) },
    { id: 'store', title: 'Errors from the store', paragraphs: [
      'createSceneStore, store.replace and store.upsert run the same checks and throw SceneValidationError without changing the store. Its message is the message of the first error, and error.problems lists every problem of that pass, errors and warnings, with paths into the scene (/nodes/3/route/speed). upsert checks the node and its relations to the nodes already in the store.',
      'validateNode(node, options?) checks one node on its own, with paths relative to the node (/route/speed); the other validate functions of core (validateNodeRoute, validateParents, validateAttachments and others) throw SceneValidationError in the same way. Scene settings are not part of a scene definition: store.configure still throws a plain Error for an invalid setting.',
    ], code: `import { createSceneStore, SceneValidationError } from '@opsorama/core';

try {
  store.replace(nodes);
} catch (error) {
  if (!(error instanceof SceneValidationError)) throw error;
  for (const problem of error.problems) console.warn(problem.path, problem.message, problem.fix);
}`, language: 'typescript' },
    { id: 'schema', title: 'JSON Schema', paragraphs: [
      'The JSON Schema of a scene definition (draft-07) is generated from the core TypeScript types and published with the package as @opsorama/core/scene-definition.schema.json, and on this website at https://opsorama.dev/schema/scene-definition.schema.json. It carries the field descriptions, enumerations and numeric ranges, so editors can complete and check scene files, and any JSON Schema validator can check them.',
      'The schema checks structure, types and ranges, and rejects unknown keys. Rules across nodes (unique IDs, parents, attachments and cycles) and each asset\'s own options are checked only by validateScene, so run validateScene as the final check. A $schema key is not part of the format; associate the schema with your scene files in the editor settings instead.',
    ], code: `import schema from '@opsorama/core/scene-definition.schema.json' with { type: 'json' };`, language: 'typescript' },
    { id: 'agents', title: 'Working with coding agents', paragraphs: ['An agent that writes or edits a scene should run validateScene after every change and repeat until it returns an empty array: read each problem\'s path to find the value, apply its fix, and treat unknown-key warnings as typos. Outside the application, the opsorama command from @opsorama/cli runs the same check on scene files (opsorama check scene.json) and renders a scene to an image (opsorama render scene.json), so the agent can also look at the result; see Command line. The Opsorama agent skill (skills/opsorama in the repository) includes these steps.'] },
  ],
};
