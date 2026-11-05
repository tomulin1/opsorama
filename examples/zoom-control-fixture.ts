import type { ZoomControlProps } from '@opsorama/ui';

/** Serializable configurator state. Hosts pass ZoomControl props directly. */
export interface ZoomConfig {
  orientation: 'horizontal' | 'vertical'; appearance: 'toolbar' | 'plain'; density: 'compact' | 'comfortable';
  controls: 'buttons' | 'slider' | 'both';
  reset: boolean; caption: string; extra: boolean; disabled: boolean;
  /** off hides the readout; reading shows SAMPLE_FPS; unknown shows the placeholder used before a sample exists. */
  fps: 'off' | 'reading' | 'unknown';
  min: number; max: number; step: number; defaultValue: number;
}
/** The datacenter viewport bar, with a neutral default zoom. */
export const defaultZoomConfig: ZoomConfig = {
  orientation: 'horizontal', appearance: 'toolbar', density: 'compact', controls: 'buttons',
  reset: true, caption: 'Zoom', extra: false, disabled: false, fps: 'off', min: .65, max: 5, step: .2, defaultValue: 1,
};
/** The configurator has no scene, so it shows a fixed host reading; real hosts sample their renderer. */
export const SAMPLE_FPS = 60;
export interface ZoomSample { config: ZoomConfig; value: number; onChange(value: number): void; }

export function zoomOptions<T>(sample: ZoomSample, extra?: T): ZoomControlProps<T> {
  const { config } = sample;
  return {
    value: sample.value, onChange: sample.onChange, min: config.min, max: config.max, step: config.step, defaultValue: config.defaultValue,
    orientation: config.orientation, appearance: config.appearance, density: config.density, controls: config.controls,
    reset: config.reset, disabled: config.disabled,
    ...(config.fps !== 'off' ? { fps: config.fps === 'reading' ? SAMPLE_FPS : null } : {}),
    ...(config.caption ? { caption: config.caption as T } : {}), ...(config.extra && extra !== undefined ? { children: extra } : {}),
  };
}

// Built-in ZoomControl defaults; the snippet lists only settings that differ.
const builtIn: Omit<ZoomConfig, 'caption' | 'extra' | 'fps'> = { orientation: 'horizontal', appearance: 'toolbar', density: 'compact', controls: 'buttons', reset: false, disabled: false, min: .65, max: 5, step: .1, defaultValue: 1 };
type Setting = [name: string, value: string | number | boolean];
function changed(config: ZoomConfig): Setting[] {
  const settings: Setting[] = [];
  for (const key of Object.keys(builtIn) as (keyof typeof builtIn)[]) if (config[key] !== builtIn[key]) settings.push([key, config[key]]);
  if (config.caption) settings.push(['caption', config.caption]);
  return settings;
}
const literal = (value: string | number | boolean) => typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : String(value);

export function zoomSnippet(config: ZoomConfig, framework: 'react' | 'vue' | 'javascript'): string {
  const settings = changed(config), fps = config.fps !== 'off';
  if (framework === 'react') {
    const props = ['value={zoom}', 'onChange={setZoom}', ...(fps ? ['fps={useRendererFps(renderer)}'] : []), ...settings.map(([name, value]) => value === true ? name : typeof value === 'string' ? `${name}="${value.replace(/"/g, '&quot;')}"` : `${name}={${value}}`)];
    const open = `<ZoomControl\n  ${props.join('\n  ')}`;
    const imports = `${fps ? "import { useRendererFps } from '@opsorama/react';\n" : ''}import { ZoomControl } from '@opsorama/react/ui';\nimport '@opsorama/ui/styles.css';\n\n${fps ? '// renderer comes from <SceneCanvas onReady={setRenderer} />\n' : ''}`;
    return `${imports}${config.extra ? `${open}\n>\n  <span>Host content</span>\n</ZoomControl>` : `${open}\n/>`}`;
  }
  const options = settings.map(([name, value]) => `${name}: ${literal(value)}`);
  if (framework === 'vue') {
    const body = ['value: zoom', 'onChange: (value) => (zoom = value)', ...(fps ? ['fps'] : []), ...options].join(',\n    ');
    const close = config.extra ? '>\n    <span>Host content</span>\n  </ZoomControl>' : ' />';
    const script = fps
      ? "import { ref, shallowRef } from 'vue';\nimport { useRendererFps } from '@opsorama/vue';\nimport { ZoomControl } from '@opsorama/vue/ui';\nimport '@opsorama/ui/styles.css';\nconst zoom = ref(1);\nconst renderer = shallowRef(null); // set from <SceneCanvas @ready>\nconst fps = useRendererFps(renderer);"
      : "import { ref } from 'vue';\nimport { ZoomControl } from '@opsorama/vue/ui';\nimport '@opsorama/ui/styles.css';\nconst zoom = ref(1);";
    return `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  <ZoomControl :options="{\n    ${body}\n  }"${close}\n</template>`;
  }
  const body = ['value: zoom', 'onChange: value => { zoom = value; view.update(zoomControl(options())); }', ...(fps ? ['fps'] : []), ...options, ...(config.extra ? ['children: hostContent'] : [])].join(',\n  ');
  const imports = `${fps ? "import { sampleRendererFps } from '@opsorama/renderer-three';\n" : ''}import { zoomControl } from '@opsorama/ui';\nimport { mountPanel } from '@opsorama/ui/dom';\nimport '@opsorama/ui/styles.css';`;
  const sampler = fps ? '\n// renderer comes from createSceneRenderer(); call stopFps() on teardown.\nconst stopFps = sampleRendererFps(() => renderer, value => { fps = value; view.update(zoomControl(options())); });' : '';
  return `${imports}\n\nlet zoom = 1${fps ? ', fps = null' : ''};\nconst options = () => ({\n  ${body},\n});\nconst view = mountPanel(container, zoomControl(options()));${sampler}\n// view.dispose() removes the control and its listeners.`;
}
