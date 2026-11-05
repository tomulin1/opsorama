import { modelVisualState } from './visual-states';
import * as THREE from 'three';
import type { AssetNode, MaterialPalette } from '@opsorama/core';
import { resolveLabPalette, type MaterialContext } from './laboratory';
import { anchor, block, cylinder, part } from './parts';

export type MobileRobotVariant = 'deck' | 'tote';
export type RobotArmVariant = 'ready' | 'reach';
export type SecurityCameraVariant = 'wall' | 'pole';

/** Semantic roles without the legacy `color` → accent mapping; each factory applies `color` to its own body part. */
function palette(node: AssetNode, context?: MaterialContext): MaterialPalette { return resolveLabPalette({ ...node, color: undefined }, context); }
function variantOf<T extends string>(node: AssetNode, values: readonly T[], label: string): T {
  const variant = node.variant ?? values[0];
  if (!values.includes(variant as T)) throw new Error(`Unknown ${label} variant: ${node.variant}.`);
  return variant as T;
}
/** Status parts glow in the state tone; inactive keeps the dim tone without emission. */
function status(node: AssetNode, p: MaterialPalette) { return node.state === 'inactive' ? { color: p.inactive, options: { roughness: .6 } } : { color: p[modelVisualState(node)], options: { emissive: p[modelVisualState(node)], roughness: .35 } }; }

/**
 * Autonomous mobile robot, 0.62 × 0.86 m, driving toward +z. Side light bands show the node state.
 * Movement comes only from host routes (`AssetNode.route`); there is no built-in navigation or load handling.
 */
export function createMobileRobot(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['deck', 'tote'] as const, 'mobile robot');
  const p = palette(node, context), body = node.materials?.accent ?? node.color ?? p.accent, light = status(node, p);
  const robot = new THREE.Group(); robot.name = `mobile-robot-${variant}`;
  block(robot, [.62, .22, .86], [0, .16, 0], body, 'robot-body', { bevel: .05, roughness: .45 });
  block(robot, [.58, .03, .78], [0, .285, 0], p.structure, 'robot-deck', { bevel: .01, roughness: .85 });
  for (const z of [-.44, .44]) block(robot, [.6, .08, .03], [0, .12, z], p.screen, 'robot-bumper', { bevel: .012 });
  for (const x of [-.312, .312]) block(robot, [.006, .025, .6], [x, .2, 0], light.color, 'robot-status', light.options);
  block(robot, [.3, .025, .008], [0, .2, .452], p.text, 'robot-headlight', { emissive: p.text });
  const lidar = cylinder(robot, .055, .05, .325, p.screen, 'robot-lidar', { segments: 16, roughness: .3 }); lidar.position.z = .3;
  cylinder(robot, .045, .015, .357, p.trim, 'robot-lidar-cap', { segments: 16 }).position.z = .3;
  for (const x of [-.27, .27]) { const wheel = part(robot, new THREE.CylinderGeometry(.075, .075, .05, 16), p.screen, 'robot-wheel'); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .075, 0); }
  for (const x of [-.22, .22]) for (const z of [-.33, .33]) part(robot, new THREE.SphereGeometry(.035, 10, 8), p.screen, 'robot-caster').position.set(x, .035, z);
  if (variant === 'tote') {
    // Decorative open tote on the deck; it is not a payload record.
    block(robot, [.5, .02, .62], [0, .31, -.04], p.surface, 'robot-tote');
    for (const x of [-.24, .24]) block(robot, [.02, .24, .62], [x, .42, -.04], p.surface, 'robot-tote');
    for (const z of [-.34, .26]) block(robot, [.5, .24, .02], [0, .42, z], p.surface, 'robot-tote');
  }
  anchor(robot, 'load', [0, .3, 0]); anchor(robot, 'front', [0, .16, .46]);
  return robot;
}

const ARM_POSES: Readonly<Record<RobotArmVariant, readonly [number, number, number]>> = { ready: [-.15, 1.5, .6], reach: [.75, .9, .5] };
/**
 * Six-axis style industrial arm on a floor plate, reaching toward +z. Variants are fixed static poses;
 * the `tool` anchor follows the gripper. No kinematics, path planning or safety zone is implied.
 */
export function createRobotArm(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['ready', 'reach'] as const, 'robot arm'), [shoulderAngle, elbowAngle, wristAngle] = ARM_POSES[variant];
  const p = palette(node, context), body = node.materials?.accent ?? node.color ?? p.accent, joint = p.structure;
  const arm = new THREE.Group(); arm.name = `robot-arm-${variant}`;
  const hub = (group: THREE.Object3D, radius: number, length: number) => { const mesh = cylinder(group, radius, length, 0, joint, 'arm-joint', { segments: 20, metalness: .25, roughness: .45 }); mesh.rotation.z = Math.PI / 2; return mesh; };
  cylinder(arm, .34, .08, .04, p.structure, 'arm-base-plate', { segments: 24 });
  for (let i = 0; i < 6; i++) cylinder(arm, .025, .02, .09, p.trim, 'arm-bolt', { segments: 8 }).position.set(Math.cos(i * Math.PI / 3) * .28, .09, Math.sin(i * Math.PI / 3) * .28);
  cylinder(arm, .24, .26, .21, body, 'arm-base', { segments: 24, roughness: .45 });
  const turret = new THREE.Group(); turret.name = 'arm-turret'; turret.position.y = .34; arm.add(turret);
  cylinder(turret, .2, .14, .07, joint, 'arm-turret', { segments: 20 });
  const shoulder = new THREE.Group(); shoulder.name = 'arm-shoulder'; shoulder.position.y = .2; shoulder.rotation.x = shoulderAngle; turret.add(shoulder);
  hub(shoulder, .13, .3); block(shoulder, [.16, .8, .18], [0, .4, 0], body, 'arm-link', { bevel: .05, roughness: .45 });
  const elbow = new THREE.Group(); elbow.name = 'arm-elbow'; elbow.position.y = .8; elbow.rotation.x = elbowAngle; shoulder.add(elbow);
  hub(elbow, .1, .24); block(elbow, [.13, .7, .14], [0, .35, 0], body, 'arm-link', { bevel: .04, roughness: .45 });
  const wrist = new THREE.Group(); wrist.name = 'arm-wrist'; wrist.position.y = .7; wrist.rotation.x = wristAngle; elbow.add(wrist);
  hub(wrist, .07, .18); cylinder(wrist, .06, .1, .06, joint, 'arm-flange', { segments: 16 });
  block(wrist, [.16, .04, .08], [0, .13, 0], p.screen, 'arm-gripper', { bevel: .01 });
  for (const x of [-.06, .06]) block(wrist, [.025, .1, .05], [x, .2, 0], p.trim, 'arm-finger', { metalness: .3, roughness: .4 });
  anchor(wrist, 'tool', [0, .25, 0]); anchor(arm, 'base', [0, 0, 0]);
  return arm;
}

const STACK = [{ role: 'normal', y: 2.32 }, { role: 'warning', y: 2.41 }, { role: 'critical', y: 2.5 }] as const;
/**
 * Enclosed CNC-style machine tool facing +z: sliding door with a dark window, control pendant and a stack light
 * that follows the node state. No program, spindle motion or cycle time is simulated.
 */
export function createMachineTool(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), shell = node.materials?.surface ?? node.color ?? p.surface;
  const machine = new THREE.Group(); machine.name = 'machine-tool';
  block(machine, [2.2, .12, 1.5], [0, .06, 0], p.structure, 'machine-plinth');
  block(machine, [2.2, 1.9, 1.5], [0, 1.07, 0], shell, 'machine-enclosure', { bevel: .04, roughness: .5 });
  block(machine, [1.1, 1.3, .04], [-.3, 1.05, .77], shell, 'machine-door', { bevel: .015, roughness: .5 });
  block(machine, [.86, .8, .01], [-.3, 1.18, .789], p.screen, 'machine-interior');
  block(machine, [.86, .8, .02], [-.3, 1.18, .797], p.glass, 'machine-window', { opacity: .45, roughness: .1 });
  block(machine, [.04, .5, .05], [.18, 1.05, .81], p.trim, 'machine-handle', { metalness: .4, roughness: .3 });
  block(machine, [1.3, .04, .04], [-.3, 1.73, .78], p.trim, 'machine-door-rail', { metalness: .3, roughness: .4 });
  block(machine, [.5, .7, .12], [.72, 1.25, .8], p.structure, 'machine-panel', { bevel: .02 });
  block(machine, [.38, .28, .01], [.72, 1.42, .862], p.screen, 'machine-screen', { roughness: .2 });
  block(machine, [.36, .18, .01], [.72, 1.1, .862], p.trim, 'machine-keypad');
  const stop = cylinder(machine, .035, .03, 0, p.critical, 'machine-emergency-stop', { segments: 14, roughness: .4 }); stop.rotation.x = Math.PI / 2; stop.position.set(.88, .96, .87);
  for (let i = 0; i < 5; i++) block(machine, [.02, .03, .6], [1.11, .5 + i * .08, -.3], p.structure, 'machine-vent');
  cylinder(machine, .02, .25, 2.145, p.trim, 'machine-beacon-pole', { segments: 8 }).position.set(.95, 2.145, -.6);
  const active = node.state === 'inactive' ? undefined : node.state === 'warning' || node.state === 'critical' ? node.state : 'normal';
  for (const lamp of STACK) {
    const lit = lamp.role === active;
    const mesh = cylinder(machine, .065, .085, lamp.y, lit ? p[lamp.role] : p.inactive, `machine-lamp-${lamp.role}`, lit ? { segments: 14, emissive: p[lamp.role], roughness: .35 } : { segments: 14, roughness: .6 });
    mesh.position.set(.95, lamp.y, -.6);
  }
  anchor(machine, 'operator', [.2, 0, 1.25]); anchor(machine, 'door', [-.3, 0, .8]);
  return machine;
}

/**
 * Bullet camera facing +z, tilted down. The wall variant hangs from a plate at 2.6 m (pivot on the floor below the wall
 * face, z = −0.165); the pole variant stands on its own 3 m pole. Alerts belong to host labels or separate markers.
 */
export function createSecurityCamera(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['wall', 'pole'] as const, 'security camera');
  const p = palette(node, context), housing = node.materials?.surface ?? node.color ?? p.surface;
  const camera = new THREE.Group(); camera.name = `security-camera-${variant}`;
  const mountY = variant === 'pole' ? 3 : 2.6;
  if (variant === 'pole') {
    cylinder(camera, .18, .04, .02, p.structure, 'camera-pole-base', { segments: 16 });
    cylinder(camera, .045, 2.98, 1.53, p.trim, 'camera-pole', { segments: 12, metalness: .3, roughness: .45 });
    block(camera, [.06, .06, .14], [0, mountY, -.03], p.trim, 'camera-arm');
  } else {
    block(camera, [.16, .22, .03], [0, mountY, -.15], p.structure, 'camera-wall-plate', { bevel: .008 });
    block(camera, [.04, .04, .18], [0, mountY, -.06], p.structure, 'camera-arm');
  }
  const head = new THREE.Group(); head.name = 'camera-head'; head.position.set(0, mountY - .02, .05); head.rotation.x = .35; camera.add(head);
  block(head, [.14, .13, .32], [0, 0, .12], housing, 'camera-body', { bevel: .03, roughness: .4 });
  block(head, [.18, .02, .38], [0, .075, .14], housing, 'camera-shield', { bevel: .008, roughness: .4 });
  const lens = cylinder(head, .045, .02, 0, p.screen, 'camera-lens', { segments: 18, roughness: .1 }); lens.rotation.x = Math.PI / 2; lens.position.z = .285;
  anchor(head, 'lens', [0, 0, .3]);
  return camera;
}
