import type { SceneNode } from '@opsorama/core';

/*
 * Placement of projected HTML labels for the scene renderer: priority order and collision avoidance. Internal to the
 * package; the renderer projects anchors, measures labels and writes the DOM.
 */

/** Horizontal CSS pixels kept free between two labels. */
export const LABEL_GAP = 5;
/** Vertical CSS pixels between label centres below which two labels overlap; also the step a label moves to make way. */
export const LABEL_ROW = 27;
/** Vertical step in CSS pixels a colliding label tries: down for node labels, up for zone labels. */
export const LABEL_STEP = 28;
/** Attempts a colliding label makes before it is hidden. */
export const LABEL_ATTEMPTS = 4;

/** A placed label: centre in CSS pixels and measured width. */
export interface LabelRect { x: number; y: number; width: number }

/** Whether two labels overlap: closer than half their widths plus `LABEL_GAP` across and `LABEL_ROW` down. */
export function labelsCollide(a: LabelRect, b: LabelRect): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + LABEL_GAP && Math.abs(a.y - b.y) < LABEL_ROW;
}

/**
 * Placement order: markers first (they never move or hide), then the selected node, critical, warning, zones and the
 * rest. Higher places earlier.
 */
export function labelPriority(node: Pick<SceneNode, 'kind' | 'state'>, selected: boolean): number {
  return node.kind === 'marker' ? 6 : selected ? 5 : node.state === 'critical' ? 4 : node.state === 'warning' ? 3 : node.kind === 'zone' ? 2 : 1;
}

/**
 * Placed labels bucketed in a grid of cells, so a collision test looks only at labels in the cells a label covers
 * instead of every placed label. Answers exactly like testing `labelsCollide` against every added rectangle.
 */
export interface LabelGrid {
  add(rect: LabelRect): void;
  /** Whether a label at (x, y) with `width` collides with an added one. */
  collides(x: number, y: number, width: number): boolean;
  /** Removes every label; the grid is reused for the next layout. */
  clear(): void;
}

/** Cell size in CSS pixels; a label covers few cells across and two or three down. */
const CELL_WIDTH = 96, CELL_HEIGHT = LABEL_ROW;
/** Cells per row in the key; columns beyond it share keys, which only costs extra exact tests. */
const COLUMNS = 1 << 16;

export function createLabelGrid(): LabelGrid {
  const cells = new Map<number, LabelRect[]>(), pool: LabelRect[][] = [];
  // Each rectangle is widened by half the gap and half a row on every side: two widened boxes overlap exactly when the
  // labels collide, so a rectangle is stored in every cell its widened box touches.
  const span = (x: number, y: number, width: number) => ({
    left: Math.floor((x - width / 2 - LABEL_GAP / 2) / CELL_WIDTH), right: Math.floor((x + width / 2 + LABEL_GAP / 2) / CELL_WIDTH),
    top: Math.floor((y - LABEL_ROW / 2) / CELL_HEIGHT), bottom: Math.floor((y + LABEL_ROW / 2) / CELL_HEIGHT),
  });
  const key = (column: number, row: number) => row * COLUMNS + (column & (COLUMNS - 1));
  return {
    add(rect) {
      const { left, right, top, bottom } = span(rect.x, rect.y, rect.width);
      for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
        const at = key(column, row); let cell = cells.get(at);
        if (!cell) { cell = pool.pop() ?? []; cells.set(at, cell); }
        cell.push(rect);
      }
    },
    collides(x, y, width) {
      const { left, right, top, bottom } = span(x, y, width), probe = { x, y, width };
      for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
        const cell = cells.get(key(column, row));
        if (cell) for (const rect of cell) if (labelsCollide(probe, rect)) return true;
      }
      return false;
    },
    clear() { for (const cell of cells.values()) { cell.length = 0; pool.push(cell); } cells.clear(); },
  };
}

/**
 * Where a label goes, given its projected centre and width and the labels already placed in `grid`: a marker stays and
 * always shows; another label that collides moves by `LABEL_STEP` (up for a zone, down otherwise) up to `LABEL_ATTEMPTS`
 * times while it stays within the viewport height, and is hidden when it still collides. A shown label is added to the grid.
 */
export function placeLabel(grid: LabelGrid, x: number, y: number, width: number, kind: SceneNode['kind'], viewportHeight: number): { y: number; visible: boolean } {
  if (kind !== 'marker') for (let attempt = 0; attempt < LABEL_ATTEMPTS && grid.collides(x, y, width); attempt++) {
    const next = y + (kind === 'zone' ? -LABEL_STEP : LABEL_STEP);
    if (next < 12 || next > viewportHeight - 18) break;
    y = next;
  }
  const visible = kind === 'marker' || !grid.collides(x, y, width);
  if (visible) grid.add({ x, y, width });
  return { y, visible };
}
