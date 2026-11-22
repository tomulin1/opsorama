import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import * as core from '@opsorama/core';
import { catalogAssets } from '@opsorama/objects';

/**
 * Keeps `@opsorama/core` and `@opsorama/three` domain-free: model knowledge (handling, catalog options, model names)
 * belongs in `@opsorama/objects`. A failure here means a domain concept leaked into a generic package; move it to the
 * catalog instead of adding an exception.
 */

/** Name parts of catalog and logistics concepts that no core export may contain. */
const FORBIDDEN_NAMES = ['handling', 'Handling', 'MoveMode', 'ForkMotion', 'Person', 'PERSON_', 'Building', 'BUILDING_', 'Contents', 'DisplayReading', 'Measurement', 'SurfaceLabel', 'Operating', 'heatEnabled', 'waterRunning', 'fillLevel'];
const ASSET_NAMES = new Set(Object.keys(catalogAssets));

const sources = (dir: string) => readdirSync(dir).filter(file => file.endsWith('.ts')).map(file => ({ file: `${dir}/${file}`, source: ts.createSourceFile(file, readFileSync(`${dir}/${file}`, 'utf8'), ts.ScriptTarget.ES2022, true) }));
const visit = (node: ts.Node, fn: (node: ts.Node) => void) => { fn(node); node.forEachChild(child => visit(child, fn)); };

/** Every string literal and static template text in a file, with its line, comments excluded. */
function stringLiterals(source: ts.SourceFile) {
  const found: { text: string; line: number }[] = [];
  visit(source, node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.push({ text: node.text, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
  });
  return found;
}
/** Literals that equal a catalog asset name, except the listed generic words. */
const assetLiterals = (dir: string, allowed: ReadonlySet<string> = new Set()) => sources(dir).flatMap(({ file, source }) => stringLiterals(source).filter(({ text }) => ASSET_NAMES.has(text) && !allowed.has(text)).map(({ text, line }) => `${file}:${line} '${text}'`));

/** Names a file exports: declarations with an export modifier and `export { ... }` specifiers. */
function exportedNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) names.push(...statement.exportClause.elements.map(element => element.name.text));
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(statement)) names.push(...statement.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
    else if ((ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) names.push(statement.name.text);
  }
  return names;
}
const moduleSpecifiers = (source: ts.SourceFile) => source.statements.flatMap(statement => (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : []);
const forbidden = (name: string) => FORBIDDEN_NAMES.some(part => name.includes(part));

describe('domain-free core and renderer', () => {
  it('core exports no catalog or handling concept', () => {
    const files = sources('packages/core/src');
    const index = files.find(({ file }) => file.endsWith('/index.ts'))!.source;
    expect(moduleSpecifiers(index).filter(forbidden)).toEqual([]);
    expect(files.map(({ file }) => file).filter(forbidden)).toEqual([]);
    const names = files.flatMap(({ file, source }) => exportedNames(source).map(name => `${file}: ${name}`));
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter(entry => forbidden(entry.split(': ')[1]))).toEqual([]);
    // The runtime module agrees with the source scan.
    expect(Object.keys(core).filter(forbidden)).toEqual([]);
  });

  it('core source names no catalog asset', () => {
    expect(ASSET_NAMES.size).toBeGreaterThan(100);
    expect(assetLiterals('packages/core/src')).toEqual([]);
  });

  it('the renderer imports no handling or move mode code', () => {
    for (const { file, source } of sources('packages/three/src')) {
      expect(moduleSpecifiers(source).filter(specifier => /handling|move-mode|@opsorama\/objects/.test(specifier)), file).toEqual([]);
      const imported = source.statements.flatMap(statement => ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings) ? statement.importClause.namedBindings.elements.map(element => (element.propertyName ?? element.name).text) : []);
      expect(imported.filter(name => /Handling|MoveMode|ResolvedTarget|Receptacle/.test(name)), file).toEqual([]);
    }
  });

  it('renderer source names no catalog asset', () => {
    // 'building' is also the first phase of the initial load (`SceneLoadPhase`), not the building model.
    expect(assetLiterals('packages/three/src', new Set(['building']))).toEqual([]);
  });
});
