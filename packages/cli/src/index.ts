/**
 * @opsorama/cli: check scene files without a browser and render scenes to PNG images in headless Chromium.
 * The `opsorama` command wraps these functions; `run` runs it in-process and returns its output.
 */
export { checkScene, checkSceneFile, formatReport, reportPassed, type SceneFileReport } from './check';
export { loadAssetModule, sceneRegistry } from './assets';
export { renderScene, type RenderDiagnostics, type RenderOptions, type RenderResult } from './render';
export { HELP, run, type RunResult } from './run';
