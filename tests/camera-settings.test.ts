import { describe, expect, it } from 'vitest';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { CAMERA_CONTROLS, CAMERA_PROJECTIONS, createSceneStore, DEFAULT_CAMERA_SETTINGS, DEFAULT_SETTINGS, SETTING_DEFINITIONS, validateCameraFollow, validateCameraTransition, validateCameraView, type CameraSettings, type SceneStore } from '@opsorama/core';
import { createRendererSlot, type SceneRenderer } from '@opsorama/three';
import { DashboardProvider as ReactProvider, useCameraView as useReactCameraView, useSceneRenderer as useReactRenderer } from '@opsorama/react';
// Vue composables, aliased so the React hook lint rules do not apply to them.
import { DashboardProvider as VueProvider, useCameraView as vueCameraView, useSceneRenderer as vueSceneRenderer } from '@opsorama/vue';

describe('camera settings', () => {
  it('default to the original orthographic overview from offset [16, 22, 30]', () => {
    expect(DEFAULT_SETTINGS.camera).toBe(DEFAULT_CAMERA_SETTINGS);
    expect(DEFAULT_CAMERA_SETTINGS).toEqual({ projection: 'orthographic', controls: 'pan', fov: 30, yaw: Math.atan2(16, 30), pitch: Math.atan2(22, 34), overview: 'ground', frameOnSelect: true });
    expect(createSceneStore().getSnapshot().settings.camera).toEqual(DEFAULT_CAMERA_SETTINGS);
    expect(SETTING_DEFINITIONS.camera.type).toBe('CameraSettings');
    expect(CAMERA_PROJECTIONS).toEqual(['orthographic', 'perspective']); expect(CAMERA_CONTROLS).toEqual(['pan', 'orbit', 'none']);
  });
  it('resets omitted camera fields to their defaults when camera is replaced, like palette', () => {
    const store = createSceneStore(undefined, { camera: { projection: 'perspective', fov: 50 } });
    expect(store.getSnapshot().settings.camera).toEqual({ ...DEFAULT_CAMERA_SETTINGS, projection: 'perspective', fov: 50 });
    store.configure({ camera: { ...store.getSnapshot().settings.camera, yaw: 1 } });
    expect(store.getSnapshot().settings.camera).toMatchObject({ projection: 'perspective', fov: 50, yaw: 1 });
    store.configure({ camera: { overview: 'bounds' } });
    expect(store.getSnapshot().settings.camera).toEqual({ ...DEFAULT_CAMERA_SETTINGS, overview: 'bounds' });
    const camera = store.getSnapshot().settings.camera; store.configure({ zoom: 2 });
    expect(store.getSnapshot().settings.camera).toBe(camera); expect(Object.isFrozen(camera)).toBe(true);
    store.configure({ camera: { yaw: undefined, frameOnSelect: false } });
    expect(store.getSnapshot().settings.camera.yaw).toBe(DEFAULT_CAMERA_SETTINGS.yaw);
    store.configure(DEFAULT_SETTINGS); expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);
  });
  it.each<[unknown, string]>([
    [{ projection: 'isometric' }, 'Use orthographic or perspective'],
    [{ controls: 'rotate' }, 'Unknown camera controls: rotate. Use pan, orbit or none.'],
    [{ overview: 'all' }, 'Use ground or bounds'],
    [{ fov: 10 }, 'between 20 and 75'],
    [{ fov: Number.NaN }, 'between 20 and 75'],
    [{ pitch: 1.6 }, 'between 0.05 and 1.55'],
    [{ yaw: Infinity }, 'finite angle'],
    [{ frameOnSelect: 'yes' }, 'frameOnSelect must be boolean'],
    [{ zoomLevel: 2 }, 'Unknown camera setting zoomLevel. Use projection, controls, fov, yaw, pitch, overview, frameOnSelect.'],
    [null, 'Setting camera must be an object'],
    [[1], 'Setting camera must be an object'],
  ])('rejects camera %j without changing the store', (camera, message) => {
    const store = createSceneStore();
    expect(() => store.configure({ camera: camera as Partial<CameraSettings> })).toThrow(message);
    expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);
    expect(() => createSceneStore(undefined, { camera: camera as Partial<CameraSettings> })).toThrow(message);
  });
  it('validates camera views and transitions with actionable messages', () => {
    expect(() => validateCameraView({ target: [1, 2, 3], yaw: 7, pitch: .5, zoom: 2 })).not.toThrow();
    expect(() => validateCameraView({})).not.toThrow();
    expect(() => validateCameraView({ target: [1, 2] as never })).toThrow('[x, y, z] in finite metres');
    expect(() => validateCameraView({ zoom: 6 })).toThrow('between 0.65 and 5');
    expect(() => validateCameraView({ pitch: 0 })).toThrow('between 0.05 and 1.55');
    expect(() => validateCameraView({ distance: 3 } as never)).toThrow('Unknown camera view field distance');
    expect(() => validateCameraTransition({ seconds: 0, easing: 'linear' })).not.toThrow();
    expect(() => validateCameraTransition({ seconds: 11 })).toThrow('between 0 and 10; 0 is a cut');
    expect(() => validateCameraTransition({ easing: 'bounce' as never })).toThrow('Use linear or ease-in-out');
    expect(() => validateCameraTransition({ duration: 1 } as never)).toThrow('Use seconds or easing');
    expect(() => validateCameraFollow({ distance: 20, heading: 'behind' })).not.toThrow(); expect(() => validateCameraFollow({})).not.toThrow();
    expect(() => validateCameraFollow({ distance: .5 })).toThrow('Follow distance must be metres between 1 and 1000');
    expect(() => validateCameraFollow({ heading: 'ahead' } as never)).toThrow('Unknown follow heading: ahead. Use fixed or behind.');
    expect(() => validateCameraFollow({ offset: 2 } as never)).toThrow('Unknown follow option offset. Use distance or heading.');
    expect(() => validateCameraFollow(null as never)).toThrow('Follow options must be an object');
  });
});

describe('renderer slot', () => {
  const fake = (name: string) => ({ name }) as unknown as SceneRenderer;
  it('holds one renderer per provider and names the fix for a second canvas', () => {
    const slot = createRendererSlot(), changes: (SceneRenderer | null)[] = [];
    const stop = slot.subscribe(() => changes.push(slot.get()));
    const first = fake('first'), second = fake('second');
    const release = slot.register(first); expect(slot.get()).toBe(first);
    expect(() => slot.register(second)).toThrow('Two SceneCanvas components are mounted under one DashboardProvider');
    expect(slot.get()).toBe(first);
    release(); expect(slot.get()).toBeNull(); release();
    const releaseSecond = slot.register(second); stop(); releaseSecond();
    expect(changes).toEqual([first, null, second]); expect(slot.get()).toBeNull();
  });
  it('gives no renderer or camera view during server rendering in React and Vue', async () => {
    const store = createSceneStore();
    function Probe() { const renderer = useReactRenderer(), view = useReactCameraView(); return createElement('output', null, `${String(renderer)}/${String(view)}`); }
    expect(renderReact(createElement(ReactProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>, { store }, createElement(Probe)))).toContain('null/null');
    expect(() => renderReact(createElement(Probe))).toThrow('A DashboardProvider is required.');
    const VueProbe = defineComponent({ setup() { const renderer = vueSceneRenderer(), view = vueCameraView(); return () => h('output', `${String(renderer.value)}/${String(view.value)}`); } });
    expect(await renderVue(createSSRApp({ render: () => h(VueProvider, { store }, () => h(VueProbe)) }))).toContain('null/null');
  });
});
