/**
 * Initial loading of a renderer: the scene is built in time slices, its shaders are compiled, then
 * the first frame is drawn. `SceneLoadState` reports each step; the indicator shows it over the scene.
 */
export type SceneLoadPhase = 'building' | 'compiling' | 'loaded';
/** `built` and `total` count visible scene nodes; `total` can change while the store changes. */
export interface SceneLoadState { phase: SceneLoadPhase; built: number; total: number; }

/** Default milliseconds of model building per slice before the renderer yields to the browser. */
export const DEFAULT_BUILD_BUDGET = 12;

/** Share of the loading work done, 0–1. Building counts as 90 %, shader compilation as the rest. */
export function loadProgress(state: SceneLoadState | null): number {
  if (!state) return 0;
  if (state.phase === 'loaded') return 1;
  if (state.phase === 'compiling') return .9;
  return state.total > 0 ? Math.min(.9, .9 * state.built / state.total) : 0;
}

/** Short English description of a load state, for the default indicator. */
export function loadStateText(state: SceneLoadState | null): string {
  if (!state) return 'Starting renderer';
  if (state.phase === 'compiling') return 'Preparing materials';
  if (state.phase === 'loaded') return 'Scene ready';
  return `Building ${state.built.toLocaleString('en-US')} of ${state.total.toLocaleString('en-US')} objects`;
}

/**
 * One slice of model building. The first build of a slice is always allowed, so every slice makes
 * progress even when one model takes longer than the budget; later builds are allowed until the
 * budget runs out. `Infinity` allows everything.
 */
export function createBuildSlice(budget: number, now: () => number = () => performance.now()): { allow(): boolean } {
  if (!(budget < Infinity)) return { allow: () => true };
  const deadline = now() + Math.max(0, budget); let first = true;
  return { allow() { if (first) { first = false; return true; } return now() < deadline; } };
}

/** Class names of the loading indicator, shared by the vanilla indicator and the React and Vue adapters. */
export const SCENE_LOADING_CLASSES = { root: 'kit-scene-loading', spinner: 'kit-scene-loading-spinner', title: 'kit-scene-loading-title', bar: 'kit-scene-loading-bar', detail: 'kit-scene-loading-detail' } as const;

/**
 * Indicator styles. The indicator fades in after 200 ms, so scenes that load faster never show it.
 * Only transform and opacity animate, so the spinner keeps turning while a slice blocks the page.
 * Colors follow the scene background; override them with `--kit-scene-loading-background`,
 * `--kit-scene-loading-text` and `--kit-scene-loading-accent`. The text has no characters that HTML
 * escapes, so server-rendered `<style>` elements stay valid CSS.
 */
export const SCENE_LOADING_STYLES = `.kit-scene-loading{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;pointer-events:none;background:var(--kit-scene-loading-background,#edf2fa);color:var(--kit-scene-loading-text,#41546d);font:600 12px/1.4 system-ui,Segoe UI,Arial,sans-serif;opacity:0;animation:kit-scene-loading-in .2s ease-out .2s forwards}
.kit-scene-loading[data-theme=midnight]{background:var(--kit-scene-loading-background,#17243b);color:var(--kit-scene-loading-text,#d4dfef)}
.kit-scene-loading-spinner{width:28px;height:28px;box-sizing:border-box;border-radius:50%;border:3px solid color-mix(in srgb,currentColor 18%,transparent);border-top-color:var(--kit-scene-loading-accent,#3a78d6);animation:kit-scene-loading-spin .8s linear infinite}
.kit-scene-loading-bar{display:block;width:min(180px,60%);height:3px;border-radius:2px;overflow:hidden;background:color-mix(in srgb,currentColor 16%,transparent)}
.kit-scene-loading-bar span{display:block;height:100%;background:var(--kit-scene-loading-accent,#3a78d6);transform-origin:left center;transition:transform .15s linear}
.kit-scene-loading-detail{font-weight:500;font-size:11px;opacity:.8;font-variant-numeric:tabular-nums}
@keyframes kit-scene-loading-in{to{opacity:1}}
@keyframes kit-scene-loading-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.kit-scene-loading{animation-duration:0s}.kit-scene-loading-spinner{animation:none}.kit-scene-loading-bar span{transition:none}}`;

/** Accessible attributes of the indicator root for a load state. */
export function loadingIndicatorAttributes(state: SceneLoadState | null): Record<string, string> {
  return { role: 'progressbar', 'aria-label': 'Loading 3D scene', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(loadProgress(state) * 100)), 'aria-valuetext': loadStateText(state) };
}

export interface LoadingIndicator { update(state: SceneLoadState, theme: string): void; dispose(): void; }

/** The default DOM indicator over `container`, used by `createSceneRenderer` unless `loadingIndicator` is false. */
export function createLoadingIndicator(container: HTMLElement, theme: string): LoadingIndicator {
  const root = document.createElement('div'), styles = document.createElement('style'), spinner = document.createElement('span'), title = document.createElement('span'), bar = document.createElement('span'), fill = document.createElement('span'), detail = document.createElement('span');
  root.className = SCENE_LOADING_CLASSES.root; styles.textContent = SCENE_LOADING_STYLES;
  spinner.className = SCENE_LOADING_CLASSES.spinner; spinner.setAttribute('aria-hidden', 'true');
  // The root's label and value text carry the state for assistive technology.
  title.className = SCENE_LOADING_CLASSES.title; title.setAttribute('aria-hidden', 'true'); title.textContent = 'Loading scene';
  bar.className = SCENE_LOADING_CLASSES.bar; bar.setAttribute('aria-hidden', 'true'); bar.append(fill);
  detail.className = SCENE_LOADING_CLASSES.detail; detail.setAttribute('aria-hidden', 'true');
  root.append(styles, spinner, title, bar, detail); container.append(root);
  const update = (state: SceneLoadState | null, nextTheme: string) => {
    for (const [name, value] of Object.entries(loadingIndicatorAttributes(state))) root.setAttribute(name, value);
    root.dataset.theme = nextTheme; fill.style.transform = `scaleX(${loadProgress(state)})`; detail.textContent = loadStateText(state);
  };
  update(null, theme);
  return { update, dispose: () => root.remove() };
}
