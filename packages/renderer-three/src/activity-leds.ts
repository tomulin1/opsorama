import type { AssetNode } from '@opsorama/core';
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { setAssetAnimator } from './animation';

export interface ActivityLed { position: readonly [number, number, number]; activity: boolean; }
/** One instance-owned draw for all LEDs. Steady links and decorative activity share the scene clock. */
export function addActivityLeds(object: Object3D, node: AssetNode, leds: readonly ActivityLed[], color: string, size: readonly [number, number, number], name: string): void {
  if (!leds.length) return;
  const bank = new InstancedMesh(new BoxGeometry(...size), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), leds.length);
  bank.name = name; bank.castShadow = false; bank.receiveShadow = false;
  bank.raycast = () => {}; // Decorative lights share the chassis selection without extra per-LED picking.
  const pose = new Object3D(), base = new Color(color), ink = base.clone();
  for (const [index, led] of leds.entries()) {
    pose.position.set(...led.position); pose.updateMatrix(); bank.setMatrixAt(index, pose.matrix);
    bank.setColorAt(index, base);
  }
  bank.instanceMatrix.needsUpdate = true; bank.instanceColor!.needsUpdate = true;
  bank.computeBoundingBox(); bank.computeBoundingSphere(); object.add(bank);
  if (node.localMotion === false || !leds.some(led => led.activity)) return;
  const seed = Array.from(node.id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 0);
  const channels = leds.map((led, index) => ({ ...led, period: .65 + (seed + index * 11) % 8 * .13, phase: (seed % 101) / 101 + index * .37, duty: .25 + index % 4 * .08 }));
  setAssetAnimator(object, ({ time }) => {
    for (const [index, led] of channels.entries()) {
      if (!led.activity) continue;
      const cycle = time / led.period + led.phase;
      const lit = cycle % 1 < led.duty && Math.floor(cycle) % 7 !== (seed + index) % 7;
      bank.setColorAt(index, ink.copy(base).multiplyScalar(lit ? 1 : .1));
    }
    bank.instanceColor!.needsUpdate = true;
  }, [bank]);
}
