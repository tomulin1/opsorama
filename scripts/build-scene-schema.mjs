#!/usr/bin/env node
/**
 * Generates the JSON Schema of a scene definition (`SceneDefinition` in @opsorama/core) with ts-json-schema-generator.
 * JSDoc on the core types carries descriptions and ranges (`@minimum`, `@maximum`, `@asType integer`, ...), so keep those
 * comments accurate. Writes:
 *   packages/core/schema/scene-definition.schema.json   (committed; published as @opsorama/core/scene-definition.schema.json)
 *   apps/site/public/schema/scene-definition.schema.json (served by the website at /schema/scene-definition.schema.json)
 * The schema checks structure, types and ranges. Cross-node rules (unique IDs, parents, cycles) and asset-factory options
 * are checked only by `validateScene` in @opsorama/core. tests/scene-schema.test.ts fails when the committed file drifts.
 * Usage: pnpm schema:generate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from 'ts-json-schema-generator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_ID = 'https://opsorama.dev/schema/scene-definition.schema.json';
export const SCHEMA_OUTPUTS = ['packages/core/schema/scene-definition.schema.json', 'apps/site/public/schema/scene-definition.schema.json'];

/** The schema as the formatted JSON text that is committed (two-space indentation, trailing newline). */
export function generateSceneSchema() {
  const generator = createGenerator({
    path: path.join(root, 'packages/core/src/index.ts'), tsconfig: path.join(root, 'tsconfig.build.json'), type: 'SceneDefinition',
    expose: 'export', topRef: true, jsDoc: 'extended', sortProps: true, strictTuples: true, skipTypeCheck: true, additionalProperties: false, functions: 'fail',
  });
  const schema = generator.createSchema('SceneDefinition');
  const ordered = {
    $schema: schema.$schema, $id: SCHEMA_ID, title: 'Opsorama scene definition',
    description: 'A scene file for @opsorama/core: { schemaVersion: 1, nodes: [...] }. The schema checks structure, types and ranges; validateScene from @opsorama/core also checks unique IDs, parents, attachments and asset options, and reports each problem with a fix.',
    ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema')),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = generateSceneSchema();
  for (const output of SCHEMA_OUTPUTS) {
    const file = path.join(root, output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  console.log(`scene schema: ${SCHEMA_OUTPUTS.join(', ')}`);
}
