#!/usr/bin/env node
/**
 * Writes the example glTF models of the website: apps/site/public/models/drone.glb, an original Opsorama model under the
 * MIT License (no third-party geometry, textures or code in the file). It is a small delivery drone with a body, four arms,
 * four legs, a textured hazard panel and four rotors, plus a looping animation clip "rotors" that spins the rotors.
 * The geometry comes from three.js primitives; the panel texture is a PNG drawn pixel by pixel. Units are metres, +y is up,
 * +z is forward, and the origin is the centre of the base, like the catalog models.
 * Usage: node scripts/build-example-models.mjs   (the output is committed; run again after changing this script)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/site/public/models/drone.glb');

/** A PNG of `width` × `height` RGBA pixels from `pixel(x, y) -> [r, g, b]`. */
function png(width, height, pixel) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { rows[y * (width * 4 + 1)] = 0; for (let x = 0; x < width; x++) { const [r, g, b] = pixel(x, y), at = y * (width * 4 + 1) + 1 + x * 4; rows[at] = r; rows[at + 1] = g; rows[at + 2] = b; rows[at + 3] = 255; } }
  const chunk = (type, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body)); return Buffer.concat([length, body, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
// The hazard panel: diagonal amber and charcoal stripes with a white frame.
const panel = png(64, 32, (x, y) => x < 2 || y < 2 || x > 61 || y > 29 ? [245, 245, 240] : (Math.floor((x + y) / 6) % 2 ? [242, 169, 0] : [38, 42, 48]));

// --- Binary buffer and glTF JSON -------------------------------------------------------------------------------------
const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [];
let byteLength = 0;
function view(data, target) {
  const padding = (4 - (byteLength % 4)) % 4; if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength); chunks.push(bytes);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, ...(target ? { target } : {}) }); byteLength += bytes.length;
  return bufferViews.length - 1;
}
function accessor(array, type, componentType, target, bounds = false) {
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type], entry = { bufferView: view(array, target), componentType, count: array.length / size, type };
  if (bounds) { const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity); for (let i = 0; i < array.length; i++) { min[i % size] = Math.min(min[i % size], array[i]); max[i % size] = Math.max(max[i % size], array[i]); } entry.min = min; entry.max = max; }
  accessors.push(entry); return accessors.length - 1;
}
const material = (name, color, roughness = .6, metalness = 0, texture) => { materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...new THREE.Color(color).convertSRGBToLinear().toArray(), 1], roughnessFactor: roughness, metallicFactor: metalness, ...(texture !== undefined ? { baseColorTexture: { index: texture } } : {}) } }); return materials.length - 1; };
const meshCache = new Map();
/** A glTF mesh from a three.js geometry (once per key), with uv coordinates when `uv`. */
function mesh(key, geometry, materialIndex, uv = false) {
  if (meshCache.has(key)) return meshCache.get(key);
  const indexed = geometry.index ? geometry : geometry.toNonIndexed(), position = new Float32Array(indexed.getAttribute('position').array), normal = new Float32Array(indexed.getAttribute('normal').array);
  const attributes = { POSITION: accessor(position, 'VEC3', 5126, 34962, true), NORMAL: accessor(normal, 'VEC3', 5126, 34962) };
  if (uv) attributes.TEXCOORD_0 = accessor(new Float32Array(indexed.getAttribute('uv').array), 'VEC2', 5126, 34962);
  const primitive = { attributes, material: materialIndex };
  if (indexed.index) primitive.indices = accessor(new Uint16Array(indexed.index.array), 'SCALAR', 5123, 34963);
  meshes.push({ name: key, primitives: [primitive] }); meshCache.set(key, meshes.length - 1);
  return meshes.length - 1;
}
const node = (name, meshIndex, translation, rotation) => { nodes.push({ name, ...(meshIndex !== undefined ? { mesh: meshIndex } : {}), ...(translation ? { translation } : {}), ...(rotation ? { rotation } : {}) }); return nodes.length - 1; };
const quaternion = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();

// --- Model ----------------------------------------------------------------------------------------------------------
const shell = material('shell', '#e8ecf2', .45), frame = material('frame', '#5d6f87', .55), rotorBlade = material('rotor', '#2d3846', .45), lamp = material('lamp', '#2fb6a3', .3);
const images = [{ bufferView: view(new Uint8Array(panel), undefined), mimeType: 'image/png' }];
const hazard = material('hazard panel', '#ffffff', .55, 0, 0);
const legHeight = .16, bodyHeight = .12, bodyY = legHeight + bodyHeight / 2;
const children = [];
children.push(node('body', mesh('body', new THREE.BoxGeometry(.42, bodyHeight, .5), shell), [0, bodyY, 0]));
children.push(node('canopy', mesh('canopy', new THREE.CylinderGeometry(.13, .16, .07, 16), frame), [0, bodyY + bodyHeight / 2 + .035, -.04]));
children.push(node('beacon', mesh('beacon', new THREE.SphereGeometry(.035, 12, 8), lamp), [0, bodyY + bodyHeight / 2 + .09, -.04]));
children.push(node('panel', mesh('panel', new THREE.PlaneGeometry(.3, .08), hazard, true), [0, bodyY, .2501]));
const arm = mesh('arm', new THREE.BoxGeometry(.05, .03, .36), frame), motor = mesh('motor', new THREE.CylinderGeometry(.035, .035, .06, 12), frame);
const blade = mesh('blade', new THREE.BoxGeometry(.34, .008, .035), rotorBlade), leg = mesh('leg', new THREE.CylinderGeometry(.012, .012, legHeight, 8), frame);
const foot = mesh('foot', new THREE.BoxGeometry(.03, .02, .3), frame);
const rotors = [];
[[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], index) => {
  const angle = Math.atan2(sx, sz), reach = .34, x = Math.sin(angle) * reach, z = Math.cos(angle) * reach;
  children.push(node(`arm-${index}`, arm, [x / 2, bodyY + .02, z / 2], quaternion(0, angle, 0)));
  children.push(node(`motor-${index}`, motor, [x, bodyY + .05, z]));
  const rotor = node(`rotor-${index}`, undefined, [x, bodyY + .085, z]); nodes[rotor].children = [node(`blade-${index}`, blade)]; children.push(rotor); rotors.push(rotor);
});
for (const side of [-1, 1]) {
  for (const end of [-1, 1]) children.push(node(`leg-${side}-${end}`, leg, [side * .14, legHeight / 2, end * .1]));
  children.push(node(`foot-${side}`, foot, [side * .14, .01, 0]));
}
const drone = node('drone', undefined); nodes[drone].children = children;

// Rotors spin half a turn per 0.25 s; opposite pairs turn the other way, as on a real quadcopter.
const times = new Float32Array([0, .125, .25]), samplers = [], channels = [];
const input = accessor(times, 'SCALAR', 5126, undefined, true);
rotors.forEach((rotor, index) => {
  const direction = index % 2 ? -1 : 1, keys = new Float32Array([0, .5, 1].flatMap(step => quaternion(0, direction * step * Math.PI, 0)));
  samplers.push({ input, output: accessor(keys, 'VEC4', 5126), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: rotor, path: 'rotation' } });
});

const gltf = {
  asset: { version: '2.0', generator: 'Opsorama scripts/build-example-models.mjs', copyright: 'Opsorama contributors, MIT License' },
  scene: 0, scenes: [{ name: 'drone', nodes: [drone] }], nodes, meshes, materials, accessors, bufferViews,
  images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }], textures: [{ sampler: 0, source: 0 }],
  animations: [{ name: 'rotors', samplers, channels }], buffers: [{ byteLength }],
};
// GLB: a 12-byte header, the JSON chunk padded with spaces and the binary chunk padded with zeros.
const json = Buffer.from(JSON.stringify(gltf)), jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const binary = Buffer.concat(chunks), binaryPadded = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
const header = Buffer.alloc(12); header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binaryPadded.length, 8);
const chunkHeader = (length, type) => { const value = Buffer.alloc(8); value.writeUInt32LE(length, 0); value.writeUInt32LE(type, 4); return value; };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, chunkHeader(jsonPadded.length, 0x4e4f534a), jsonPadded, chunkHeader(binaryPadded.length, 0x004e4942), binaryPadded]));
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KiB, ${meshes.length} meshes, ${nodes.length} nodes)`);
