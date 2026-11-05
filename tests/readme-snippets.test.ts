import { describe, expect, it } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { compileScript, parse } from 'vue/compiler-sfc';

/** The root README and every package README; their code blocks are user-facing examples and must stay correct. */
const readmes = ['README.md', ...readdirSync('packages').map(name => `packages/${name}/README.md`)];
const blocks = readmes.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/```(tsx|ts|vue)\n([\s\S]*?)```/g)].map((match, index) => ({ file, index, language: match[1], code: match[2] })));
/** Inside the repository, so the snippets resolve @opsorama/* to the workspace packages; removed after the test. */
const folder = path.resolve('tests/.readme-snippets');
/** Snippets may use a `container` element the host page provides. */
const PRELUDE = 'export {};\ndeclare const container: HTMLElement;\n';

describe('README code examples', () => {
  it('type-check against the workspace packages', () => {
    const scripts = blocks.filter(block => block.language !== 'vue');
    expect(scripts.length).toBeGreaterThanOrEqual(7);
    mkdirSync(folder, { recursive: true });
    try {
      // Each snippet is its own module, as it would be in a user's project.
      const files = scripts.map(block => { const file = path.join(folder, `${block.file.replace(/[/.]/g, '-')}-${block.index}.${block.language}`); writeFileSync(file, PRELUDE + block.code); return file; });
      const program = ts.createProgram(files, { strict: true, noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [] });
      const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file && files.includes(path.resolve(diagnostic.file.fileName)));
      expect(errors.map(diagnostic => `${path.basename(diagnostic.file!.fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)).toEqual([]);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }, 60_000);

  it('compile as Vue components that use only components the Vue adapter exports', async () => {
    const vue = blocks.filter(block => block.language === 'vue');
    expect(vue.length).toBeGreaterThanOrEqual(2);
    const adapter = await import('@opsorama/vue');
    for (const block of vue) {
      const { descriptor, errors } = parse(block.code, { filename: `${block.file}.vue` });
      expect(errors, block.file).toEqual([]);
      compileScript(descriptor, { id: 'readme', inlineTemplate: true });
      const used = [...descriptor.template!.content.matchAll(/<([A-Z][A-Za-z]+)/g)].map(match => match[1]);
      for (const name of new Set(used)) expect(adapter, `${block.file}: ${name}`).toHaveProperty(name);
    }
  });
});
