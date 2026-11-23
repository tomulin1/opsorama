import fs from 'node:fs';
import { validateScene, type SceneProblem } from '@opsorama/core';
import { assetValidator, type AssetRegistry } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

/** The result of checking one scene file. */
export interface SceneFileReport {
  /** The file as given. */
  file: string;
  /** Every problem `validateScene` found, errors and warnings, in document order. Empty when the file could not be read or parsed. */
  problems: SceneProblem[];
  /** Set when the file could not be read or is not JSON; the scene was not checked. */
  error?: string;
}

/** Checks a parsed scene definition: the scene rules of `validateScene` and, through `assetValidator`, the asset registry. */
export function checkScene(input: unknown, assets: AssetRegistry = catalogAssets): SceneProblem[] {
  return validateScene(input, { validateAsset: assetValidator(assets) });
}

/** Reads, parses and checks one scene file (`SceneDefinition` JSON). */
export function checkSceneFile(file: string, assets: AssetRegistry = catalogAssets): SceneFileReport {
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { return { file, problems: [], error: `Cannot read the file: ${(error as Error).message}` }; }
  let input: unknown;
  try { input = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); }
  catch (error) { return { file, problems: [], error: `Not valid JSON: ${(error as Error).message}. A scene file is a SceneDefinition object { "schemaVersion": 1, "nodes": [...] }.` }; }
  return { file, problems: checkScene(input, assets) };
}

/** True when the report has no errors; warnings count only with `strict`. */
export function reportPassed(report: SceneFileReport, strict = false): boolean {
  return !report.error && !report.problems.some(problem => problem.severity === 'error' || strict);
}

/** A readable report: one summary line, then one block per problem with its JSON Pointer, rule, message and fix. */
export function formatReport(report: SceneFileReport): string {
  if (report.error) return `${report.file}: ${report.error}`;
  const errors = report.problems.filter(problem => problem.severity === 'error').length, warnings = report.problems.length - errors;
  const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;
  const lines = [`${report.file}: ${errors || warnings ? `${count(errors, 'error')}, ${count(warnings, 'warning')}` : 'ok'}`];
  for (const problem of report.problems) {
    lines.push(`  ${problem.severity.padEnd(7)} ${problem.path || '/'}  [${problem.rule}]${problem.nodeId ? `  node ${problem.nodeId}` : ''}`);
    lines.push(`          ${problem.message}`, `          Fix: ${problem.fix}`);
  }
  return lines.join('\n');
}
