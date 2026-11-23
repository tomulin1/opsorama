import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, DEFAULT_SETTINGS, LIGHTING_PRESETS, QUALITY_LEVELS, SETTING_DEFINITIONS } from '@opsorama/core';
import { applyLights, fogRange, lightingLook, QUALITY_PROFILES, setShadowMapSize, skyTexture } from '../packages/three/src/lighting';

describe('lighting, sky, fog and quality settings', () => {
  it('default to the original look and validate their values', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ lighting: 'studio', sky: false, fog: false, quality: 'high' });
    expect([...LIGHTING_PRESETS]).toEqual(['studio', 'daylight', 'overcast', 'dusk', 'night']);
    expect([...QUALITY_LEVELS]).toEqual(['high', 'balanced', 'low']);
    for (const key of ['lighting', 'sky', 'fog', 'quality'] as const) expect(SETTING_DEFINITIONS[key].description.length).toBeGreaterThan(20);
    const store = createSceneStore(undefined, { lighting: 'dusk', sky: true, fog: true, quality: 'low' });
    expect(store.getSnapshot().settings).toMatchObject({ lighting: 'dusk', sky: true, fog: true, quality: 'low' });
    expect(() => store.configure({ lighting: 'noon' as 'dusk' })).toThrow('Unknown lighting preset: noon. Use studio, daylight, overcast, dusk, night.');
    expect(() => store.configure({ quality: 'ultra' as 'low' })).toThrow('Unknown quality level: ultra. Use high, balanced, low.');
    expect(() => store.configure({ fog: 'yes' as unknown as boolean })).toThrow('Setting fog must be boolean.');
    expect(store.getSnapshot().settings.lighting).toBe('dusk');
  });

  it('keep studio light identical to the renderer before presets existed', () => {
    expect(lightingLook('studio', 'light')).toMatchObject({ ambient: { sky: '#f7faff', ground: '#c2ccd9', intensity: 2 }, sun: { color: '#ffffff', intensity: 2.6, position: [-12, 25, 16] }, exposure: 1.16, background: '#edf2fa' });
    expect(lightingLook('studio', 'midnight')).toMatchObject({ ambient: { intensity: 1.05 }, background: '#17243b', exposure: 1.16 });
  });

  it('give every preset and theme a complete, distinct look', () => {
    const hex = /^#[0-9a-f]{6}$/;
    const looks = LIGHTING_PRESETS.flatMap(preset => (['light', 'midnight'] as const).map(theme => lightingLook(preset, theme)));
    for (const look of looks) {
      for (const color of [look.ambient.sky, look.ambient.ground, look.sun.color, look.background, look.sky.top, look.sky.horizon]) expect(color).toMatch(hex);
      expect(look.ambient.intensity).toBeGreaterThan(0); expect(look.sun.intensity).toBeGreaterThan(0); expect(look.exposure).toBeGreaterThan(.9);
      // The sun stays about as far away as the original, so the shadow camera keeps covering the scene.
      expect(new THREE.Vector3(...look.sun.position).length()).toBeGreaterThan(25); expect(new THREE.Vector3(...look.sun.position).length()).toBeLessThan(36);
    }
    expect(new Set(looks.map(look => look.background)).size).toBe(looks.length);
    // Dusk has a low sun; night is dimmer than daylight.
    expect(lightingLook('dusk', 'light').sun.position[1]).toBeLessThan(lightingLook('daylight', 'light').sun.position[1]);
    expect(lightingLook('night', 'light').sun.intensity).toBeLessThan(lightingLook('daylight', 'light').sun.intensity);
  });

  it('apply a look to lights and exposure', () => {
    const ambient = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight(), renderer = { toneMappingExposure: 1 };
    const look = lightingLook('dusk', 'light');
    applyLights(look, ambient, sun, renderer);
    expect(`#${ambient.color.getHexString()}`).toBe(look.ambient.sky); expect(`#${ambient.groundColor.getHexString()}`).toBe(look.ambient.ground);
    expect(`#${sun.color.getHexString()}`).toBe(look.sun.color); expect(sun.position.toArray()).toEqual([...look.sun.position]);
    expect(renderer.toneMappingExposure).toBe(look.exposure); expect(sun.intensity).toBe(look.sun.intensity);
  });

  it('draw the sky gradient and place the fog around the camera target', () => {
    const stops: [number, string][] = [], fillRect = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ createLinearGradient: () => ({ addColorStop: (offset: number, color: string) => stops.push([offset, color]) }), fillRect, fillStyle: '' }) } as unknown as HTMLCanvasElement;
    const texture = skyTexture('#112233', '#aabbcc', () => canvas);
    expect([canvas.width, canvas.height]).toEqual([2, 256]); expect(stops).toEqual([[0, '#112233'], [.62, '#aabbcc'], [1, '#aabbcc']]);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 2, 256); expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    const near = fogRange(40, 20), far = fogRange(80, 20);
    expect(near.near).toBeLessThan(40); expect(near.far).toBeGreaterThan(40 + 20); expect(far.near).toBeGreaterThan(near.near);
    expect(fogRange(1, 50).near).toBe(.1);
  });

  it('lower pixel ratio and shadow maps with quality, and reallocate a changed shadow map', () => {
    expect(QUALITY_PROFILES).toEqual({
      high: { maxPixelRatio: 2, shadowMapSize: 2048, shadowType: THREE.PCFSoftShadowMap },
      balanced: { maxPixelRatio: 1.5, shadowMapSize: 1024, shadowType: THREE.PCFSoftShadowMap },
      low: { maxPixelRatio: 1, shadowMapSize: 512, shadowType: THREE.BasicShadowMap },
    });
    const sun = new THREE.DirectionalLight(), dispose = vi.fn();
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.map = { dispose } as unknown as THREE.WebGLRenderTarget;
    setShadowMapSize(sun, 2048); expect(dispose).not.toHaveBeenCalled();
    setShadowMapSize(sun, 512); expect(dispose).toHaveBeenCalledTimes(1); expect(sun.shadow.map).toBeNull(); expect(sun.shadow.mapSize.toArray()).toEqual([512, 512]);
  });
});
