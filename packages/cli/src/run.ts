import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { SceneSettingsPatch } from '@opsorama/core';
import { cliDirectory, loadAssetModule, sceneRegistry } from './assets';
import { checkSceneFile, formatReport, reportPassed } from './check';
import { renderScene } from './render';

export const HELP = `Usage: opsorama <command> [options]

Commands:
  check <scene.json ...>   Check scene files against the scene rules and the asset catalog, without a browser.
  render <scene.json>      Check a scene, then render it to a PNG image in headless Chromium.

Options for check and render:
  --assets <module>        Module (JavaScript or TypeScript) whose default or "assets" export holds more asset factories.
  --json                   Print the result as JSON.

check:
  --strict                 Fail on warnings (unknown keys) too.

render:
  -o, --out <file.png>     Image path. Default: the scene file's path with .png.
  --settings <file.json>   Scene settings (theme, camera, zoom, labels, ...). motion defaults to false.
  --css <file.css>         Host stylesheet, for example for node labels (.kit-node-label). Repeatable.
  --width <px>             Default 1280.
  --height <px>            Default 800.
  --scale <ratio>          Device pixel ratio of the image. Default 1.
  --channel <name>         Use an installed browser, for example chrome or msedge, instead of Playwright's Chromium.
  --executable-path <path> Use the Chromium-based browser at this path.
  --timeout <ms>           Time to wait for the scene to load. Default 60000.

Exit status: 0 when everything passed, 1 when a scene has errors or rendering reported errors, 2 for a usage or tool error.
Rendering needs playwright-core and a browser: npm install --save-dev playwright-core && npx playwright install chromium`;

/** Output and exit status of one command line run. */
export interface RunResult { code: 0 | 1 | 2; stdout: string; stderr: string }

const readJson = (file: string, what: string): unknown => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (error) { throw new Error(`Cannot read the ${what} ${file}: ${(error as Error).message}`); }
};
const number = (value: string | undefined, name: string) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number; received ${value}.`);
  return parsed;
};

/** Runs the command line with `args` (without the node and script paths) and returns its output instead of printing it. */
export async function run(args: readonly string[]): Promise<RunResult> {
  const out: string[] = [];
  try {
    const { values, positionals } = parseArgs({
      args: [...args], allowPositionals: true, strict: true,
      options: {
        assets: { type: 'string' }, json: { type: 'boolean' }, strict: { type: 'boolean' }, out: { type: 'string', short: 'o' }, settings: { type: 'string' }, css: { type: 'string', multiple: true },
        width: { type: 'string' }, height: { type: 'string' }, scale: { type: 'string' }, channel: { type: 'string' }, 'executable-path': { type: 'string' },
        timeout: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      },
    });
    const [command, ...files] = positionals;
    if (values.version) return { code: 0, stdout: JSON.parse(fs.readFileSync(path.join(cliDirectory, '../package.json'), 'utf8')).version, stderr: '' };
    if (values.help || !command) return { code: values.help ? 0 : 2, stdout: values.help ? HELP : '', stderr: values.help ? '' : HELP };

    if (command === 'check') {
      if (!files.length) throw new Error('check needs at least one scene file, for example: opsorama check scene.json');
      const registry = sceneRegistry(values.assets ? await loadAssetModule(values.assets) : undefined);
      const reports = files.map(file => checkSceneFile(file, registry)), ok = reports.every(report => reportPassed(report, values.strict));
      if (values.json) out.push(JSON.stringify({ ok, files: reports.map(report => ({ ...report, ok: reportPassed(report, values.strict) })) }, null, 2));
      else out.push(...reports.map(formatReport));
      return { code: ok ? 0 : 1, stdout: out.join('\n'), stderr: '' };
    }

    if (command === 'render') {
      if (files.length !== 1) throw new Error('render takes one scene file, for example: opsorama render scene.json -o scene.png');
      const [file] = files, scene = readJson(file, 'scene file');
      const settings = values.settings ? readJson(values.settings, 'settings file') as SceneSettingsPatch : undefined;
      const target = values.out ?? file.replace(/\.json$/i, '') + '.png';
      const result = await renderScene({
        scene, settings, assetsModule: values.assets, baseDirectory: path.dirname(path.resolve(file)), out: target,
        width: number(values.width, 'width'), height: number(values.height, 'height'), scale: number(values.scale, 'scale'),
        channel: values.channel, executablePath: values['executable-path'], stylesheets: values.css, timeout: number(values.timeout, 'timeout'),
      });
      const invalid = result.problems.some(problem => problem.severity === 'error'), ok = !invalid && !result.errors.length && result.diagnostics?.loaded === true;
      if (values.json) out.push(JSON.stringify({ ok, file, out: result.out ?? null, problems: result.problems, errors: result.errors, diagnostics: result.diagnostics ?? null }, null, 2));
      else {
        if (result.problems.length) out.push(formatReport({ file, problems: result.problems }));
        if (invalid) out.push(`${file}: not rendered; fix the errors above first.`);
        for (const error of result.errors) out.push(`  render error  ${error}`);
        if (result.out) out.push(`${file}: rendered ${result.diagnostics?.objects ?? 0} nodes to ${result.out}${result.diagnostics?.loaded ? '' : ' (the scene did not finish loading)'}`);
      }
      return { code: ok ? 0 : 1, stdout: out.join('\n'), stderr: '' };
    }
    throw new Error(`Unknown command: ${command}. Use check or render; opsorama --help lists the options.`);
  } catch (error) {
    return { code: 2, stdout: out.join('\n'), stderr: `opsorama: ${(error as Error).message}` };
  }
}
