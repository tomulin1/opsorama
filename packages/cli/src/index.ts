/**
 * @opsorama/cli: check scene files without a browser, render scenes to PNG images in headless Chromium, and give coding
 * agents the catalog, the documentation and the agent skill of this version.
 * The `opsorama` command wraps these functions; `run` runs it in-process and returns its output.
 */
export { checkScene, checkSceneFile, formatReport, reportPassed, type SceneFileReport } from './check';
export { loadAssetModule, sceneRegistry } from './assets';
export { renderScene, type RenderDiagnostics, type RenderOptions, type RenderResult } from './render';
export { HELP, run, type RunOptions, type RunResult } from './run';
export { catalogEntries, describeAsset, formatAsset, formatEntries, searchCatalog, type AssetDetails, type CatalogEntry } from './catalog';
export { docTopics, findDocTopic, formatTopics, installSkill, skillText, type DocTopic, type SkillInstall } from './agent';
