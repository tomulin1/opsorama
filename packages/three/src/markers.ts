import { MARKER_SIZES, resolveMarkerTone, type MarkerIcon, type MarkerIconName, type MarkerNode, type MarkerShape, type MarkerTone, type MaterialOverrides } from '@opsorama/core';

/**
 * Scene markers: projected HTML buttons drawn as inline SVG. The renderer builds them in
 * its label layer and adds the stylesheet below once per label layer, so a host needs no CSS import.
 * Every rule has the specificity of one class; a host overrides it with a more specific selector.
 */

type IconElement = readonly [tag: 'path' | 'circle' | 'rect' | 'polyline', attributes: Readonly<Record<string, string>>];
const path = (d: string): IconElement => ['path', { d }];

/**
 * Built-in icons on a 24 × 24 grid, drawn as 2.4 px white strokes. `alert` and `info` are plain glyphs
 * so they read inside any shape. The others are from Lucide (https://lucide.dev), ISC licence:
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other copyright (c) for Lucide are held by Lucide Contributors 2022. Permission to use, copy,
 * modify, and/or distribute this software for any purpose with or without fee is hereby granted,
 * provided that the above copyright notice and this permission notice appear in all copies.
 */
export const MARKER_ICON_ELEMENTS: Readonly<Record<Exclude<MarkerIconName, 'none'>, readonly IconElement[]>> = Object.freeze({
  alert: [path('M12 5.5v8'), path('M12 18.5h.01')],
  info: [path('M12 11v7.5'), path('M12 5.5h.01')],
  check: [path('M20 6 9 17l-5-5')],
  x: [path('M18 6 6 18'), path('m6 6 12 12')],
  thermometer: [path('M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z')],
  network: [['rect', { x: '16', y: '16', width: '6', height: '6', rx: '1' }], ['rect', { x: '2', y: '16', width: '6', height: '6', rx: '1' }], ['rect', { x: '9', y: '2', width: '6', height: '6', rx: '1' }], path('M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3'), path('M12 12V8')],
  plug: [path('M12 22v-5'), path('M9 8V2'), path('M15 8V2'), path('M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z')],
  zap: [path('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z')],
  droplet: [path('M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z')],
  flame: [path('M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4')],
  lock: [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], path('M7 11V7a5 5 0 0 1 10 0v4')],
  wrench: [path('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z')],
  clock: [path('M12 6v6l4 2'), ['circle', { cx: '12', cy: '12', r: '10' }]],
  'wifi-off': [path('M12 20h.01'), path('M8.5 16.429a5 5 0 0 1 7 0'), path('M5 12.859a10 10 0 0 1 5.17-2.69'), path('M19 12.859a10 10 0 0 0-2.007-1.523'), path('M2 8.82a15 15 0 0 1 4.177-2.643'), path('M22 8.82a15 15 0 0 0-11.288-3.764'), path('m2 2 20 20')],
  package: [path('M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'), path('M12 22V12'), ['polyline', { points: '3.29 7 12 12 20.71 7' }], path('m7.5 4.27 9 5.15')],
  user: [path('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), ['circle', { cx: '12', cy: '7', r: '4' }]],
  bell: [path('M10.268 21a2 2 0 0 0 3.464 0'), path('M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326')],
});

/** Shape outlines in SVG user units. Badges use a 40 × 40 box; the pin is 40 × 50 with its tip at the bottom centre. `icon` is the icon's centre and size in the same units. */
export const MARKER_SHAPE_GEOMETRY: Readonly<Record<MarkerShape, { viewBox: readonly [number, number]; d: string; icon: readonly [x: number, y: number, size: number] }>> = Object.freeze({
  pin: { viewBox: [40, 50], d: 'M20 48.5C20 48.5 3.5 31.5 3.5 19a16.5 16.5 0 0 1 33 0C36.5 31.5 20 48.5 20 48.5Z', icon: [20, 19, 18] },
  circle: { viewBox: [40, 40], d: 'M20 2.5a17.5 17.5 0 1 1 0 35a17.5 17.5 0 1 1 0-35Z', icon: [20, 20, 19] },
  square: { viewBox: [40, 40], d: 'M11 3h18a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H11a8 8 0 0 1-8-8V11a8 8 0 0 1 8-8Z', icon: [20, 20, 19] },
  diamond: { viewBox: [40, 40], d: 'M20 2 38 20 20 38 2 20Z', icon: [20, 20, 15] },
  triangle: { viewBox: [40, 40], d: 'M20 3 38 35.5H2Z', icon: [20, 25, 14] },
  hexagon: { viewBox: [40, 40], d: 'M20 2 35.6 11v18L20 38 4.4 29V11Z', icon: [20, 20, 17] },
  octagon: { viewBox: [40, 40], d: 'M12.34 1.5h15.32L38.5 12.34v15.32L27.66 38.5H12.34L1.5 27.66V12.34Z', icon: [20, 20, 19] },
  shield: { viewBox: [40, 40], d: 'M20 2.5 35 8v11c0 9.5-6.5 15.5-15 18.5C11.5 34.5 5 28.5 5 19V8Z', icon: [20, 19, 16] },
});

const TONE_FALLBACK: Readonly<Record<MarkerTone, string>> = Object.freeze({ critical: '#d9483b', warning: '#d98a1c', success: '#2f9b74', info: '#4779ed', neutral: '#6b7a8f' });
const TONE_ROLE = { critical: 'critical', warning: 'warning', success: 'normal', info: 'accent', neutral: 'inactive' } as const;
const DEFAULT_ICON: Readonly<Record<MarkerTone, MarkerIconName>> = Object.freeze({ critical: 'alert', warning: 'alert', success: 'check', info: 'info', neutral: 'info' });

export interface MarkerAppearance {
  shape: MarkerShape; tone: MarkerTone;
  /** Fill colour: the node's `color`, else the scene palette role of the tone, else a built-in tone colour. */
  color: string;
  /** Icon elements, or null for `none`. */
  icon: readonly IconElement[] | null;
  /** Rendered width and height in CSS pixels. */
  width: number; height: number;
  pulse: boolean;
}

/** Everything a marker looks like, without touching the DOM. The renderer and tests share it. */
export function resolveMarkerAppearance(node: MarkerNode, palette?: MaterialOverrides): MarkerAppearance {
  const shape = node.shape ?? 'pin', tone = resolveMarkerTone(node, node.state), icon: MarkerIcon = node.icon ?? DEFAULT_ICON[tone];
  const width = MARKER_SIZES[node.markerSize ?? 'medium'], [boxWidth, boxHeight] = MARKER_SHAPE_GEOMETRY[shape].viewBox;
  return {
    shape, tone, color: node.color ?? palette?.[TONE_ROLE[tone]] ?? TONE_FALLBACK[tone],
    icon: icon === 'none' ? null : typeof icon === 'string' ? MARKER_ICON_ELEMENTS[icon] : icon.paths.map(path),
    width, height: width * boxHeight / boxWidth, pulse: node.pulse ?? tone === 'critical',
  };
}

/** Accessible name: the visible card text in reading order. */
export const markerAccessibleName = (node: MarkerNode) => `Select ${[node.eyebrow, node.label, node.detail].filter(Boolean).join(' · ')}`;

const SVG = 'http://www.w3.org/2000/svg';
let gradientCount = 0;
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Readonly<Record<string, string | number>>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/** The marker button. The renderer positions it, toggles `hidden` and `kit-node-selected`, and removes it with its node. */
export function createMarkerElement(node: MarkerNode, palette?: MaterialOverrides): HTMLButtonElement {
  const look = resolveMarkerAppearance(node, palette), geometry = MARKER_SHAPE_GEOMETRY[look.shape], [boxWidth, boxHeight] = geometry.viewBox;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'kit-marker'; button.dataset.shape = look.shape; button.dataset.tone = look.tone;
  button.setAttribute('aria-label', markerAccessibleName(node));
  button.style.setProperty('--kit-marker-color', look.color); button.style.width = `${look.width}px`; button.style.height = `${look.height}px`;
  // A pin's tip is its anchor; badges are centred on it.
  if (look.shape === 'pin') button.style.marginTop = `${-look.height / 2}px`;
  const graphic = svg('svg', { class: 'kit-marker-graphic', viewBox: `0 0 ${boxWidth} ${boxHeight}`, 'aria-hidden': 'true', focusable: 'false' });
  const id = `kit-marker-shade-${++gradientCount}`, gradient = svg('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 });
  gradient.append(svg('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': .22 }), svg('stop', { offset: 1, 'stop-color': '#000000', 'stop-opacity': .22 }));
  const defs = svg('defs', {}); defs.append(gradient); graphic.append(defs);
  if (look.pulse) graphic.append(svg('path', { class: 'kit-marker-pulse', d: geometry.d, fill: look.color }));
  graphic.append(svg('path', { class: 'kit-marker-body', d: geometry.d, fill: look.color }), svg('path', { class: 'kit-marker-shade', d: geometry.d, fill: `url(#${id})` }));
  if (look.icon) {
    const [x, y, size] = geometry.icon, icon = svg('g', { class: 'kit-marker-icon', transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`, fill: 'none', stroke: '#ffffff', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    for (const [tag, attributes] of look.icon) icon.append(svg(tag, attributes));
    graphic.append(icon);
  }
  const card = document.createElement('span'); card.className = 'kit-marker-card';
  for (const [part, text] of [['eyebrow', node.eyebrow], ['title', node.label], ['detail', node.detail]] as const) {
    if (!text) continue;
    const line = document.createElement('span'); line.className = `kit-marker-${part}`; line.textContent = text; card.append(line);
  }
  button.append(graphic, card);
  return button;
}

/** Stylesheet for markers. The renderer appends it to its label layer; `data-motion` on that layer gates the pulse. */
export const MARKER_STYLES = `
.kit-marker{position:absolute;top:0;left:0;padding:0;margin:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;pointer-events:auto;overflow:visible}
.kit-marker-graphic{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 3px 5px rgba(19,37,58,.35));transition:filter .12s}
.kit-marker-body{stroke:#fff;stroke-width:2.5;stroke-linejoin:round}
.kit-marker-pulse{opacity:0;transform-box:fill-box;transform-origin:center}
.kit-marker:hover .kit-marker-graphic,.kit-marker:focus-visible .kit-marker-graphic{filter:drop-shadow(0 5px 9px rgba(19,37,58,.45)) brightness(1.08)}
.kit-marker:focus-visible{outline:none}
.kit-marker:focus-visible .kit-marker-body,.kit-node-selected.kit-marker .kit-marker-body{stroke:#1d3045;stroke-width:3.5}
.kit-marker:hover,.kit-marker:focus-visible,.kit-node-selected.kit-marker{z-index:10}
.kit-marker-card{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:2px;width:max-content;max-width:240px;padding:9px 12px 10px;border-radius:8px;border-top:3px solid var(--kit-marker-color);background:#1d3045;color:#f1f5f9;box-shadow:0 8px 22px rgba(15,31,51,.25);font:600 12px/1.4 "Segoe UI",Arial,sans-serif;text-align:left;white-space:normal;pointer-events:none;visibility:hidden;opacity:0;transition:opacity .12s}
.kit-marker-card::after{content:'';position:absolute;top:100%;left:50%;margin-left:-6px;border:6px solid transparent;border-top-color:#1d3045}
.kit-marker-eyebrow{color:color-mix(in srgb,var(--kit-marker-color) 50%,#fff);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.kit-marker-detail{color:#c4d0dd;font-weight:500;font-size:11px}
.kit-marker:hover .kit-marker-card,.kit-marker:focus-visible .kit-marker-card,.kit-node-selected.kit-marker .kit-marker-card{visibility:visible;opacity:1}
@keyframes kit-marker-pulse{from{opacity:.55;transform:scale(1)}to{opacity:0;transform:scale(1.6)}}
@media (prefers-reduced-motion:no-preference){.kit-scene-labels[data-motion="on"] .kit-marker-pulse{animation:kit-marker-pulse 1.6s ease-out infinite}}
`;
