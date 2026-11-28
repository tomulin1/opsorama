import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import type { TextAlign } from '@opsorama/core';

/*
 * Canvas textures of text nodes, and the image textures of image nodes, each cached per renderer with reference counts.
 * Text is drawn with the system font stack of the projected labels, so no font files are loaded. Internal to the package.
 */

/** Font of text nodes: the system font stack and weight of the projected HTML labels. */
export const TEXT_FONT = Object.freeze({ family: 'system-ui, "Segoe UI", Arial, sans-serif', weight: 600 });
/** Capital-letter height in texture pixels. With mipmaps this stays sharp from small to screen-filling text. */
export const TEXT_CAP_PIXELS = 48;
/** Largest width or height of a text texture in pixels; longer text is drawn at a lower resolution to fit. */
export const MAX_TEXT_TEXTURE_SIZE = 2048;
/** Distance between baselines, in capital-letter heights; `TextNode.size` documents the same value. */
export const TEXT_LINE_SPACING = 1.75;
/** Space around the text inside its texture, in capital-letter heights: room for accents above and descenders below. */
const PADDING = Object.freeze({ top: .4, bottom: .5, side: .3 });
/** Share of the font size that capital letters fill when the canvas cannot measure it. */
const CAP_RATIO = .7;

/** The 2D drawing calls a text texture needs; a canvas `CanvasRenderingContext2D` has them all. */
export interface TextCanvasContext {
  font: string; fillStyle: unknown; textAlign: string; textBaseline: string;
  measureText(text: string): { width: number; actualBoundingBoxAscent?: number };
  clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}
/** A drawing surface for text: an `HTMLCanvasElement` or `OffscreenCanvas`, or a stand-in in tests. */
export interface TextCanvas { width: number; height: number; getContext(type: '2d'): TextCanvasContext | null }
/** Creates a blank canvas for one text texture. */
export type TextCanvasFactory = () => TextCanvas;
/** The browser canvas: an `HTMLCanvasElement` from the current document. */
export const createDocumentCanvas: TextCanvasFactory = () => document.createElement('canvas') as unknown as TextCanvas;

/** What a text texture shows; equal styles share one texture. */
export interface TextStyle { text: string; color: string; align: TextAlign }
/** A drawn text: its texture and the size of the text block in capital-letter heights (multiply by `TextNode.size` for metres). */
export interface TextTexture {
  texture: Texture;
  width: number; height: number;
  /** Where the node origin sits along the width: 0 at the left edge, 0.5 in the middle, 1 at the right edge. */
  anchor: number;
}
/** One use of a cached texture; `release` is safe to call more than once. */
export interface TextureHandle<T> { readonly value: T; release(): void }

/** Lines of a text: `\n`, `\r\n` and `\r` break lines. */
export const textLines = (text: string) => text.split(/\r\n|\r|\n/);

/** Draws `style` on a new canvas from `createCanvas` and returns it as a texture with the block size in capital-letter heights. */
export function drawTextTexture(style: TextStyle, createCanvas: TextCanvasFactory = createDocumentCanvas): TextTexture {
  const canvas = createCanvas(), context = canvas.getContext('2d');
  if (!context) throw new Error('Text nodes need a 2D canvas context, which this browser did not provide. Show the text in a label or host HTML instead.');
  const lines = textLines(style.text), reference = 100, font = (size: number) => `${TEXT_FONT.weight} ${size}px ${TEXT_FONT.family}`;
  context.font = font(reference);
  // Measured at a reference size, then scaled: text widths grow linearly with the font size.
  const cap = (context.measureText('H').actualBoundingBoxAscent || reference * CAP_RATIO) / reference;
  const widths = lines.map(line => context.measureText(line).width / reference / cap);
  const width = Math.max(...widths, 0) + PADDING.side * 2, height = PADDING.top + 1 + (lines.length - 1) * TEXT_LINE_SPACING + PADDING.bottom;
  const capPixels = Math.min(TEXT_CAP_PIXELS, MAX_TEXT_TEXTURE_SIZE / width, MAX_TEXT_TEXTURE_SIZE / height);
  canvas.width = Math.max(1, Math.ceil(width * capPixels)); canvas.height = Math.max(1, Math.ceil(height * capPixels));
  // Resizing a canvas resets its state; set the font and style afterwards.
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font(capPixels / cap); context.fillStyle = style.color; context.textBaseline = 'alphabetic'; context.textAlign = style.align;
  const x = style.align === 'left' ? PADDING.side * capPixels : style.align === 'right' ? canvas.width - PADDING.side * capPixels : canvas.width / 2;
  lines.forEach((line, index) => context.fillText(line, x, (PADDING.top + 1 + index * TEXT_LINE_SPACING) * capPixels));
  const texture = new CanvasTexture(canvas as unknown as HTMLCanvasElement);
  texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter; texture.generateMipmaps = true;
  return { texture, width: canvas.width / capPixels, height: canvas.height / capPixels, anchor: style.align === 'left' ? 0 : style.align === 'right' ? 1 : .5 };
}

/** Text textures of one renderer, shared by equal text, color and alignment and disposed when their last user releases them. */
export interface TextTextureCache {
  /** The texture of `style`, drawn on first use. Release the handle when the node is rebuilt or removed. */
  acquire(style: TextStyle): TextureHandle<TextTexture>;
  /** Textures alive now. */
  readonly size: number;
  /** Disposes every texture; handles released later have no effect. */
  dispose(): void;
}

/** Creates a text texture cache; `createCanvas` defaults to the document's canvas. */
export function createTextTextureCache(createCanvas: TextCanvasFactory = createDocumentCanvas): TextTextureCache {
  const entries = new Map<string, { value: TextTexture; users: number }>();
  return {
    acquire(style) {
      const key = JSON.stringify([style.text, style.color, style.align]);
      let entry = entries.get(key);
      if (!entry) { entry = { value: drawTextTexture(style, createCanvas), users: 0 }; entries.set(key, entry); }
      entry.users++;
      const current = entry; let released = false;
      return { value: current.value, release() {
        if (released) return; released = true;
        if (--current.users > 0 || entries.get(key) !== current) return;
        entries.delete(key); current.value.texture.dispose();
      } };
    },
    get size() { return entries.size; },
    dispose() { for (const entry of entries.values()) entry.value.texture.dispose(); entries.clear(); },
  };
}

/** Callbacks of one image load. */
export interface ImageLoadCallbacks { load(image: TexImageSource): void; error(): void }
/** Starts loading `src` and returns a function that cancels the load; after cancelling no callback runs. */
export type LoadImage = (src: string, callbacks: ImageLoadCallbacks) => () => void;
/**
 * Loads with an `HTMLImageElement`, `crossOrigin = 'anonymous'`: a cross-origin image needs `Access-Control-Allow-Origin`
 * from its server (WebGL cannot use it otherwise). Cancelling clears the element's handlers and source.
 */
export const loadImageElement: LoadImage = (src, callbacks) => {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
  image.onload = () => callbacks.load(image); image.onerror = () => callbacks.error();
  image.src = src;
  return () => { image.onload = null; image.onerror = null; image.removeAttribute('src'); };
};

/** A user of an image texture: `load` runs once the texture exists (at once when it already does), `error` when loading failed. */
export interface ImageTextureListener { load(texture: Texture): void; error(): void }
/** Image textures of one renderer, shared by equal `src` and disposed (or their load cancelled) when their last user releases them. */
export interface ImageTextureCache {
  /**
   * Starts or joins the load of `src` with `anisotropy` (default 1). Images of one `src` and one anisotropy share a texture.
   * Returns the release function, safe to call more than once; after it no callback runs.
   */
  acquire(src: string, listener: ImageTextureListener, anisotropy?: number): () => void;
  /** Images loading, loaded or failed and still in use. */
  readonly size: number;
  /** Cancels every load and disposes every texture; releases afterwards have no effect. */
  dispose(): void;
}

/**
 * Creates an image texture cache. A failed `src` stays failed while it is in use, so its users report the error once each;
 * after its last user releases it, the next use loads it again. `load` defaults to `loadImageElement`.
 */
export function createImageTextureCache(load: LoadImage = loadImageElement): ImageTextureCache {
  type Entry = { users: number; state: 'loading' | 'loaded' | 'failed'; texture: Texture | null; listeners: Set<ImageTextureListener>; cancel: (() => void) | null };
  const entries = new Map<string, Entry>();
  return {
    acquire(src, listener, anisotropy = 1) {
      const key = `${anisotropy} ${src}`;
      let entry = entries.get(key);
      if (!entry) {
        const created: Entry = { users: 0, state: 'loading', texture: null, listeners: new Set(), cancel: null };
        entry = created; entries.set(key, created);
        created.cancel = load(src, {
          load: image => {
            if (entries.get(key) !== created || created.state !== 'loading') return;
            // The node's anisotropy keeps an image sharp on a plane seen at a slant; Three.js caps it at the graphics card's maximum.
            const texture = new CanvasTexture(image as HTMLImageElement); texture.colorSpace = SRGBColorSpace; texture.anisotropy = anisotropy;
            created.state = 'loaded'; created.texture = texture; created.cancel = null;
            for (const user of [...created.listeners]) user.load(texture);
          },
          error: () => {
            if (entries.get(key) !== created || created.state !== 'loading') return;
            created.state = 'failed'; created.cancel = null;
            for (const user of [...created.listeners]) user.error();
          },
        });
      }
      const current = entry; current.users++; current.listeners.add(listener);
      if (current.state === 'loaded') listener.load(current.texture!); else if (current.state === 'failed') listener.error();
      let released = false;
      return () => {
        if (released) return; released = true; current.listeners.delete(listener);
        if (--current.users > 0 || entries.get(key) !== current) return;
        entries.delete(key); current.cancel?.(); current.texture?.dispose();
      };
    },
    get size() { return entries.size; },
    dispose() { for (const entry of entries.values()) { entry.cancel?.(); entry.texture?.dispose(); entry.listeners.clear(); } entries.clear(); },
  };
}
