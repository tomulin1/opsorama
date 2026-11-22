import { describe, expect, it } from 'vitest';
import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_CAMERA_SETTINGS, type SceneNode } from '@opsorama/core';
import { applyOrthographic, applyPerspective, clampPitch, DEFAULT_CAMERA_OFFSET, ease, fitBounds, fitDistance, fitExtent, FOLLOW_TURN_RATE, followExtent, followYaw, frameTarget, glideStep, groundExtent, groundTarget, interpolatePose, normalizeAngle, orbitDelta, orthographicZoom, viewAngles, viewDirection, type CameraPose } from '../packages/three/src/camera-rig';

// Numbers pinned from the renderer before the camera math moved into camera-rig.ts: an OrthographicCamera at
// target + (16, 22, 30) looking at the target, camera.zoom = min(w / (34·extent), h / (21·extent)) · zoom.
const QUATERNION = [-0.2747660762071653, 0.23260482501900534, 0.06869151905179134, 0.9304193000760215];
const { yaw, pitch } = DEFAULT_CAMERA_SETTINGS;
const ground: SceneNode[] = [{ id: 'floor', kind: 'ground', size: [40, 24], position: [2, 0, 3] }];
function overview(width: number, height: number, zoom: number, extent = groundExtent(ground), target = groundTarget(ground)) {
  const camera = new OrthographicCamera(-20, 20, 12, -12, -150, 150);
  applyOrthographic(camera, { target: target.toArray(), yaw, pitch, zoom, extent }, { width, height, fov: 30, radius: 20 });
  return camera;
}
const close = (actual: readonly number[], expected: readonly number[]) => expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 12));

describe('camera rig at default settings', () => {
  it('points the default yaw and pitch along the original offset', () => {
    expect(viewAngles(DEFAULT_CAMERA_OFFSET)).toEqual({ yaw, pitch });
    close(viewDirection(yaw, pitch).multiplyScalar(Math.hypot(16, 22, 30)).toArray(), [16, 22, 30]);
  });
  it.each([
    [1200, 700, 1, 26.388888888888893, [0.04398148148148149, 0.0753968253968254]],
    [400, 800, 1, 9.313725490196079, [0.04656862745098039, 0.023284313725490197]],
    [1600, 500, 1, 18.84920634920635, [0.02356150793650794, 0.0753968253968254]],
    [1200, 700, .65, 17.152777777777782, [0.02858796296296297, 0.04900793650793652]],
    [1200, 700, 5, 131.94444444444446, [0.2199074074074074, 0.37698412698412703]],
  ])('reproduces the overview at %i × %i, zoom %f', (width, height, zoom, cameraZoom, [scaleX, scaleY]) => {
    const camera = overview(width, height, zoom);
    close(camera.position.toArray(), [18, 22, 33]); close(camera.quaternion.toArray(), QUATERNION);
    expect(camera.zoom).toBeCloseTo(cameraZoom, 10);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(scaleX, 12); expect(camera.projectionMatrix.elements[5]).toBeCloseTo(scaleY, 12);
    expect(camera.projectionMatrix.elements[10]).toBeCloseTo(-0.006666666666666667, 15);
  });
  it('keeps the overview target and extent rules', () => {
    expect(groundTarget([]).toArray()).toEqual([0, 0, -.5]); expect(groundExtent([])).toBe(1);
    expect(groundExtent([{ id: 'small', kind: 'ground', size: [10, 10] }])).toBe(1);
    expect(groundExtent(ground)).toBe(24 / 19); expect(groundTarget(ground).toArray()).toEqual([2, 0, 3]);
  });
  it('reproduces frame with fit', () => {
    const fit = fitBounds(new Box3(new Vector3(1, 0, 2), new Vector3(3, 2.5, 4.5)), yaw, pitch), zoom = 1.3;
    expect(fit.extent * zoom).toBeCloseTo(0.48338761226469135, 14); expect(fit.target.toArray()).toEqual([2, 1.25, 3.25]);
    const camera = overview(1200, 700, zoom, fit.extent * zoom, fit.target);
    close(camera.position.toArray(), [18, 23.25, 33.25]); close(camera.quaternion.toArray(), QUATERNION); expect(camera.zoom).toBeCloseTo(89.64510515756669, 10);
    expect(fitExtent(new Vector3(40, 8, 20), yaw, pitch)).toBeCloseTo(1.4537740443423044, 14);
    expect(fitExtent(new Vector3(), yaw, pitch) * 2).toBeCloseTo(.6, 14);
  });
  it('reproduces frame without fit, including the orthographic 0.48 share at the overview scale', () => {
    close(frameTarget(new Vector3(10, 1, -6), 'orthographic', false).toArray(), [4.8, 0, -2.88]);
    expect(frameTarget(new Vector3(10, 1, -6), 'orthographic', true).toArray()).toEqual([10, 0, -6]);
    expect(frameTarget(new Vector3(10, 1, -6), 'perspective', false).toArray()).toEqual([10, 0, -6]);
  });
  it('keeps the original glide rate and reduced-motion cut', () => {
    expect(glideStep(.016, false)).toBeCloseTo(1 - Math.exp(-.08), 15); expect(glideStep(.05, true)).toBe(1);
  });
  it('fits zoom 1 at both viewport limits', () => {
    expect(orthographicZoom(1, 34, 1000, 1)).toBe(1); expect(orthographicZoom(1, 1000, 21, 1)).toBe(1); expect(orthographicZoom(2, 680, 420, 2)).toBe(20);
  });
});

describe('perspective camera', () => {
  it('shows the same area at the target as the orthographic camera', () => {
    for (const [width, height] of [[1200, 700], [400, 800], [1600, 500]]) {
      const pose: CameraPose = { target: [2, 0, 3], yaw, pitch, zoom: 1.5, extent: 1.25 };
      const ortho = new OrthographicCamera(), perspective = new PerspectiveCamera();
      applyOrthographic(ortho, pose, { width, height, fov: 30, radius: 30 }); applyPerspective(perspective, pose, { width, height, fov: 30, radius: 30 });
      // A point on the view plane through the target at the edge of the orthographic frustum projects to the same NDC.
      const right = new Vector3().setFromMatrixColumn(ortho.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(ortho.matrixWorld, 1);
      for (const [axis, half] of [[right, width / 2 / ortho.zoom], [up, height / 2 / ortho.zoom]] as const) {
        const point = new Vector3(...pose.target).addScaledVector(axis, half);
        const a = point.clone().project(ortho), b = point.clone().project(perspective);
        expect(b.x).toBeCloseTo(a.x, 10); expect(b.y).toBeCloseTo(a.y, 10); expect(b.z).toBeGreaterThan(-1); expect(b.z).toBeLessThan(1);
      }
      expect(perspective.position.distanceTo(new Vector3(...pose.target))).toBeCloseTo(fitDistance(1.25, width / height, 30) / 1.5, 10);
    }
  });
  it('projects points behind the camera beyond the far plane, so labels there are hidden', () => {
    const camera = new PerspectiveCamera();
    applyPerspective(camera, { target: [0, 0, 0], yaw, pitch, zoom: 1, extent: 1 }, { width: 800, height: 600, fov: 40, radius: 20 });
    const behind = camera.position.clone().addScaledVector(viewDirection(yaw, pitch), 5).project(camera);
    expect(Math.abs(behind.z)).toBeGreaterThan(1);
  });
});

describe('camera transitions', () => {
  it('eases and interpolates the shorter way round', () => {
    expect(ease(.5, 'ease-in-out')).toBe(.5); expect(ease(.25, 'linear')).toBe(.25); expect(ease(2, 'ease-in-out')).toBe(1); expect(ease(-1, 'linear')).toBe(0);
    const from: CameraPose = { target: [0, 0, 0], yaw: 3, pitch: .4, zoom: 1, extent: 1 }, to: CameraPose = { target: [10, 2, -4], yaw: -3, pitch: .8, zoom: 4, extent: .25 };
    const middle = interpolatePose(from, to, .5);
    expect(middle.target).toEqual([5, 1, -2]); expect(normalizeAngle(middle.yaw)).toBeCloseTo(Math.PI, 12); expect(middle.pitch).toBeCloseTo(.6, 12);
    expect(middle.zoom).toBeCloseTo(2, 12); expect(middle.extent).toBeCloseTo(.5, 12);
    expect(interpolatePose(from, to, 1).target).toEqual([10, 2, -4]);
    expect(normalizeAngle(-Math.PI)).toBe(Math.PI); expect(normalizeAngle(7)).toBeCloseTo(7 - 2 * Math.PI, 12);
  });
});

describe('orbit and follow math', () => {
  it('turns half a turn of yaw per viewport height and clamps pitch to its range', () => {
    expect(orbitDelta(100, 0, 400).yaw).toBeCloseTo(-Math.PI / 4, 12); expect(orbitDelta(0, -200, 400).pitch).toBeCloseTo(-Math.PI / 2, 12);
    expect(orbitDelta(10, 10, 0)).toEqual({ yaw: -10 * Math.PI, pitch: 10 * Math.PI });
    expect(clampPitch(2)).toBe(1.55); expect(clampPitch(-1)).toBe(.05); expect(clampPitch(.7)).toBe(.7);
  });
  it('turns a behind follow toward the view from behind the node, the shorter way round, and snaps with reduced motion', () => {
    // A node heading +X (yaw π/2) is seen from behind at camera yaw −π/2 (the camera sits on −X).
    expect(normalizeAngle(followYaw(0, Math.PI / 2, 0, 1, true))).toBeCloseTo(-Math.PI / 2, 12);
    const step = followYaw(0, Math.PI / 2, 0, .1, false);
    expect(step).toBeCloseTo(-Math.PI / 2 * (1 - Math.exp(-.1 * FOLLOW_TURN_RATE)), 12);
    // From yaw 3 toward −3 (heading 0.1416…) it turns forward through π, not back through 0.
    expect(followYaw(3, -3 - Math.PI, 0, .1, false)).toBeGreaterThan(3);
    // An orbit offset is kept; a node that keeps its heading is held without drift.
    expect(normalizeAngle(followYaw(0, 0, .4, 1, true))).toBeCloseTo(normalizeAngle(Math.PI + .4), 12);
    let yaw = Math.PI; for (let frame = 0; frame < 120; frame++) yaw = followYaw(yaw, 0, 0, 1 / 60, false);
    expect(normalizeAngle(yaw)).toBeCloseTo(Math.PI, 12);
  });
  it('places a perspective camera the follow distance from its target', () => {
    const extent = followExtent(25, 1.5, 1200 / 700, 30), camera = new PerspectiveCamera();
    applyPerspective(camera, { target: [3, 0, 4], yaw, pitch, zoom: 1.5, extent }, { width: 1200, height: 700, fov: 30, radius: 20 });
    expect(camera.position.distanceTo(new Vector3(3, 0, 4))).toBeCloseTo(25, 10);
  });
});
