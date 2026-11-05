import type { DocArticle } from './content';
export const zoomControlArticle: DocArticle = {
  slug: 'zoom-control', title: 'Zoom control', category: 'COMPONENTS',
  description: 'A compact, controlled zoom bar for scenes and previews: horizontal or vertical, buttons or a slider, with an optional caption and reset. The configurator below runs the real component through React, Vue and plain JavaScript.',
  sections: [
    { id: 'usage', title: 'Usage', paragraphs: ['ZoomControl is a standalone control, not a panel. It is controlled: supply value and onChange. Without a configuration it renders the compact datacenter viewport bar with built-in icons. Import @opsorama/ui/styles.css for that appearance, or supply your own styles.', 'To drive scene zoom, spread useSceneZoom() from @opsorama/react inside a DashboardProvider. It supplies value, onChange and the 0.65–5 range that the scene store validates. In Vue, useSceneZoom() returns a computed options object.', 'Mouse wheel zoom is a separate renderer option. Pass wheelZoom to SceneCanvas or createSceneRenderer. It changes the scene zoom setting, so a control bound with useSceneZoom() follows it. A host that keeps zoom in its own state subscribes to the store. It is off by default because it takes the wheel from the page.'], code: `import { useSceneZoom } from '@opsorama/react';\nimport { ZoomControl } from '@opsorama/react/ui';\nimport '@opsorama/ui/styles.css';\n\n// Scene zoom\n<ZoomControl {...useSceneZoom()} step={0.2} reset caption="Zoom" />\n\n// Any other zoom state, such as a preview\n<ZoomControl value={zoom} onChange={setZoom} orientation="vertical"\n  defaultValue={1.25} />`, language: 'tsx' },
    { id: 'options', title: 'Options', headers: ['Option', 'Default', 'Description'], rows: [
      ['value, onChange', 'required', 'Current zoom and the change callback. Emitted values are clamped to the range and rounded.'],
      ['min, max', '0.65, 5', 'Range. Equal to the scene ZOOM_RANGE; hosts may narrow it. Buttons disable at their bound.'],
      ['step', '0.1', 'Button increment.'],
      ['defaultValue', '1', 'Reset target and the 100% reference for format percent.'],
      ['controls', 'buttons', 'buttons, slider or both.'],
      ['sliderStep', 'any', 'Native range granularity. Browsers snap a range to min + k × step, so the default keeps button values exact.'],
      ['orientation', 'horizontal', 'horizontal or vertical. Vertical puts zoom in above zoom out and stays one button wide: captions wrap and FPS stacks over its unit.'],
      ['appearance', 'toolbar', 'toolbar is a standalone bar with its own surface; plain has no surface, for an existing host toolbar.'],
      ['density', 'compact', 'compact (26 px buttons) or comfortable (30 px buttons).'],
      ['format', 'multiplier', 'Spoken slider value: 1.25×, a percentage of defaultValue, or a (value, defaultValue) => string function. The control shows no zoom value.'],
      ['reset, onReset', 'false', 'Shows a reset button. onReset replaces onChange(defaultValue), for example to reset pan as well.'],
      ['caption', 'none', 'Visible text before the controls.'],
      ['fps', 'hidden', 'Frames per second shown after a divider. A number shows the rounded reading, null shows — until a sample exists, and undefined hides the readout.'],
      ['children', 'none', 'Host content after the divider and FPS, such as extra view buttons.'],
      ['icons', 'built-in', 'Replace the zoomIn, zoomOut and reset icons with your own content.'],
      ['labels', 'English', 'Accessible names and texts: group, zoomIn, zoomOut, reset, slider, fps, fpsUnit, fpsHint.'],
      ['disabled', 'false', 'A disabled control emits nothing.'],
      ['id, className, style', 'none', 'Root element hooks.'],
    ] },
    { id: 'fps', title: 'FPS readout', paragraphs: ['The control only displays the reading; the host measures it. useRendererFps(renderer) from @opsorama/react or @opsorama/vue samples a mounted SceneRenderer once per second and returns null while unknown. Plain JavaScript uses sampleRendererFps(() => renderer, onSample) from @opsorama/three, which returns a stop function.', 'The sampler reads the completed-frame counter of the renderer, so it adds no second animation loop. It reports null after a renderer change until two samples exist, while the document is hidden and after disposal. The value is scene throughput, not GPU timing or a hardware benchmark. In React, keep the hook in a small component around the control, so the update once per second does not re-render a large dashboard.'], code: `import { SceneCanvas, useRendererFps, useSceneZoom } from '@opsorama/react';
import { ZoomControl } from '@opsorama/react/ui';

function ViewportZoom({ renderer }: { renderer: SceneRenderer | null }) {
  return <ZoomControl {...useSceneZoom()} fps={useRendererFps(renderer)} reset caption="Zoom" />;
}

<SceneCanvas assets={catalogAssets} onReady={setRenderer}><ViewportZoom renderer={renderer} /></SceneCanvas>`, language: 'tsx' },
    { id: 'appearance', title: 'Appearance', paragraphs: ['The preset gives the root zero specificity and its parts one class, which beats element resets such as button { background: none }. A host class such as .my-bar .zc-button overrides it. It reads the --panel-surface, --panel-border, --panel-radius and --panel-accent variables shared with data panels, so a themed dashboard restyles both together.', 'Zoom-specific variables: --zoom-surface, --zoom-border, --zoom-radius, --zoom-shadow, --zoom-padding, --zoom-gap, --zoom-button-size, --zoom-button-radius, --zoom-font-size, --zoom-icon, --zoom-icon-hover, --zoom-hover, --zoom-caption, --zoom-value, --zoom-accent and --zoom-slider-size. Colors follow the color-scheme of the host. Positioning, for example floating in a viewport corner, is host layout.'], code: `.my-viewport .zc-control {\n  --zoom-radius: 999px;\n  --zoom-surface: #10233a;\n  --zoom-icon: #a9c3dc;\n  --zoom-value: #ffffff;\n}`, language: 'css' },
    { id: 'vue', title: 'Native Vue', paragraphs: ['Vue takes the same contract in an options prop. The default slot replaces children. Native Vue components render the shared presentation tree without a React runtime.'], code: `<script setup lang="ts">\nimport { useSceneZoom } from '@opsorama/vue';\nimport { ZoomControl } from '@opsorama/vue/ui';\nconst zoom = useSceneZoom();\n</script>\n\n<template>\n  <ZoomControl :options="{ ...zoom, step: 0.2, reset: true, caption: 'Zoom' }" />\n</template>`, language: 'vue' },
    { id: 'javascript', title: 'Plain JavaScript', paragraphs: ['Build the tree with zoomControl and mount it with mountPanel. update keeps the focused button or slider. dispose removes the root and its listeners. The mount sets the live value property of the slider, so a host can correct a value the user dragged.'], code: `import { zoomControl } from '@opsorama/ui';\nimport { mountPanel } from '@opsorama/ui/dom';\n\nlet zoom = 1;\nconst options = () => ({ value: zoom, onChange: value => { zoom = value; view.update(zoomControl(options())); } });\nconst view = mountPanel(container, zoomControl(options()));`, language: 'js' },
    { id: 'accessibility', title: 'Accessibility', paragraphs: ['The root is a labeled group of native buttons and an optional native range input with value text. Every button has an accessible name and a tooltip. Built-in icons are hidden from assistive technology. Disabled bounds and states use the native disabled attribute.', 'Keyboard: buttons use Tab and Enter or Space. With sliderStep any, arrow keys move by 1% of the range and Page Up/Down by 10%. Touch pinch zoom on the canvas is not implemented.'] },
  ],
};
