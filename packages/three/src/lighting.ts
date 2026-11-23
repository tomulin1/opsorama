import * as THREE from 'three';
import type { LightingPreset, QualityLevel, SceneSettings } from '@opsorama/core';

/*
 * Lighting presets, sky, fog and quality profiles of the scene renderer and the node preview. Internal to the package:
 * hosts choose them through `SceneSettings.lighting`, `sky`, `fog` and `quality`.
 */

/** The light, exposure and colors of one lighting preset in one theme. */
export interface LightingLook {
  /** Hemisphere (ambient) light: sky and ground colors and intensity. */
  ambient: { sky: string; ground: string; intensity: number };
  /** The directional sun that casts shadows: color, intensity and position (its direction, at the default distance). */
  sun: { color: string; intensity: number; position: readonly [number, number, number] };
  /** Tone mapping exposure. */
  exposure: number;
  /** Flat background color, also the fog color without a sky. */
  background: string;
  /** Sky gradient, top of the view to the horizon; the fog takes the horizon color with a sky. */
  sky: { top: string; horizon: string };
}

type Variant = Omit<LightingLook, 'sun'> & { sun: Omit<LightingLook['sun'], 'position'> };
interface Preset { position: readonly [number, number, number]; light: Variant; midnight: Variant }

/** Studio light and midnight are the renderer's original look; the other presets keep the same sun distance. */
const PRESETS: Readonly<Record<LightingPreset, Preset>> = {
  studio: {
    position: [-12, 25, 16],
    light: { ambient: { sky: '#f7faff', ground: '#c2ccd9', intensity: 2 }, sun: { color: '#ffffff', intensity: 2.6 }, exposure: 1.16, background: '#edf2fa', sky: { top: '#cfdcee', horizon: '#f2f6fb' } },
    midnight: { ambient: { sky: '#f7faff', ground: '#c2ccd9', intensity: 1.05 }, sun: { color: '#ffffff', intensity: 2.6 }, exposure: 1.16, background: '#17243b', sky: { top: '#0f1829', horizon: '#26375a' } },
  },
  daylight: {
    position: [-16, 27, 9],
    light: { ambient: { sky: '#dcebff', ground: '#bdb6a2', intensity: 1.6 }, sun: { color: '#fff3dd', intensity: 3.3 }, exposure: 1.1, background: '#e2edf9', sky: { top: '#8dbbea', horizon: '#e6f0fa' } },
    midnight: { ambient: { sky: '#c9dcf7', ground: '#5b6070', intensity: 1 }, sun: { color: '#fff3dd', intensity: 3 }, exposure: 1.1, background: '#1b2b45', sky: { top: '#24518a', horizon: '#5f84b5' } },
  },
  overcast: {
    position: [-8, 30, 12],
    light: { ambient: { sky: '#eef2f6', ground: '#c9ced6', intensity: 2.7 }, sun: { color: '#f3f6fa', intensity: .9 }, exposure: 1.12, background: '#e6eaf0', sky: { top: '#c3ccd7', horizon: '#eef1f5' } },
    midnight: { ambient: { sky: '#d9dee6', ground: '#6b7280', intensity: 1.4 }, sun: { color: '#e8ecf2', intensity: .7 }, exposure: 1.12, background: '#1f2836', sky: { top: '#2b3442', horizon: '#4a5566' } },
  },
  dusk: {
    position: [-29, 10, 12],
    light: { ambient: { sky: '#ffdcbc', ground: '#6c6e88', intensity: 1.3 }, sun: { color: '#ffb066', intensity: 2.5 }, exposure: 1.06, background: '#f2dccb', sky: { top: '#5a6aa6', horizon: '#f6c398' } },
    midnight: { ambient: { sky: '#e8b996', ground: '#3b3d52', intensity: .9 }, sun: { color: '#ff9d52', intensity: 2.1 }, exposure: 1.06, background: '#2a2236', sky: { top: '#1e2346', horizon: '#a2604a' } },
  },
  night: {
    position: [-10, 26, 20],
    light: { ambient: { sky: '#8399c9', ground: '#202838', intensity: .75 }, sun: { color: '#bccbff', intensity: .85 }, exposure: 1.2, background: '#1a2438', sky: { top: '#0b1122', horizon: '#2a3858' } },
    midnight: { ambient: { sky: '#7186b4', ground: '#151b28', intensity: .6 }, sun: { color: '#b0c0ff', intensity: .7 }, exposure: 1.2, background: '#0f1626', sky: { top: '#070b17', horizon: '#1f2b47' } },
  },
};

/** The look of a lighting preset in a theme. */
export function lightingLook(preset: LightingPreset, theme: SceneSettings['theme']): LightingLook {
  const entry = PRESETS[preset], variant = theme === 'midnight' ? entry.midnight : entry.light;
  return { ...variant, sun: { ...variant.sun, position: entry.position } };
}

/** Sets a hemisphere light, a sun and a renderer's exposure to a look. */
export function applyLights(look: LightingLook, ambient: THREE.HemisphereLight, sun: THREE.DirectionalLight, renderer: { toneMappingExposure: number }): void {
  ambient.color.set(look.ambient.sky); ambient.groundColor.set(look.ambient.ground); ambient.intensity = look.ambient.intensity;
  sun.color.set(look.sun.color); sun.intensity = look.sun.intensity; sun.position.set(...look.sun.position);
  renderer.toneMappingExposure = look.exposure;
}

/** A vertical gradient texture for `Scene.background`: `top` at the top of the view, `horizon` at the bottom. */
export function skyTexture(top: string, horizon: string, createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')): THREE.Texture {
  const canvas = createCanvas(); canvas.width = 2; canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, top); gradient.addColorStop(.62, horizon); gradient.addColorStop(1, horizon);
    context.fillStyle = gradient; context.fillRect(0, 0, 2, 256);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Fog distances for a camera at `distance` from its target over a scene of half-size `extent`: the area around the target
 * stays clear, and the scene fades out toward its far side.
 */
export function fogRange(distance: number, extent: number): { near: number; far: number } {
  return { near: Math.max(.1, distance - extent * .2), far: distance + extent * 1.6 };
}

/** What a quality level changes: the highest canvas pixel ratio and the shadow map size and filter. */
export interface QualityProfile { maxPixelRatio: number; shadowMapSize: number; shadowType: THREE.ShadowMapType }
export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = Object.freeze({
  high: { maxPixelRatio: 2, shadowMapSize: 2048, shadowType: THREE.PCFSoftShadowMap },
  balanced: { maxPixelRatio: 1.5, shadowMapSize: 1024, shadowType: THREE.PCFSoftShadowMap },
  low: { maxPixelRatio: 1, shadowMapSize: 512, shadowType: THREE.BasicShadowMap },
});

/** Sets a sun's shadow map size; an existing map is released so the next frame allocates one of the new size. */
export function setShadowMapSize(sun: THREE.DirectionalLight, size: number): void {
  if (sun.shadow.mapSize.x === size && sun.shadow.mapSize.y === size) return;
  sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null;
}
