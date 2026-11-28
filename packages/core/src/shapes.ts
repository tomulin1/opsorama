import type { NodeTransfer } from './attachment';
import type { NodeController } from './controller';
import type { AssetNode, SceneNode, Vec3 } from './index';
import type { NodeBase } from './node-base';
import type { NodeRoute } from './route';

/*
 * Primitive and group nodes: shapes and lines drawn by the renderer without an asset registry, and groups that hold other
 * nodes. JSDoc tags such as @minimum and @maximum are copied into the scene JSON Schema (pnpm schema:generate) and must
 * state the same limits as the checks in validate-scene.ts.
 */

/**
 * Metres, greater than 0.
 * @exclusiveMinimum 0
 */
type PositiveMetres = number;
/**
 * Metres, 0 or more.
 * @minimum 0
 */
type Metres = number;

/**
 * Motion of the node's root transform, shared by asset, shape and group nodes. `route` and `controller` exclude each
 * other; an attached node owns neither (it moves with its carrier).
 */
export interface MotionFields {
  /** Visual route that owns the root transform while present. */
  route?: NodeRoute;
  /** Per-frame controller that owns the root position and heading; exclusive with `route`. */
  controller?: NodeController;
  /** Animate a change of `attachment` or `parentId` from the previous world pose, e.g. an item handed over; see `NodeTransfer`. */
  transfer?: NodeTransfer;
}
/** Node kinds that accept `MotionFields`. */
export const MOTION_NODE_KINDS = Object.freeze(['asset', 'shape', 'group'] as const);
/** A node that may own a route, a controller or a transfer. */
export type MotionNode = AssetNode | ShapeNode | GroupNode;
/** Whether `node` is an asset, shape or group node, the kinds that accept `MotionFields`. */
export function isMotionNode(node: SceneNode): node is MotionNode {
  return node.kind === 'asset' || node.kind === 'shape' || node.kind === 'group';
}
/** Node kinds a `parentId` may name: assets (whose `view` shows or hides children) and groups (always open). */
export const CONTAINER_NODE_KINDS = Object.freeze(['asset', 'group'] as const);

/**
 * A container without geometry: its children (nodes whose `parentId` names it) use its local coordinates, so moving,
 * turning or scaling the group moves them together. A group is always open: its children show while the group shows.
 * Selection bubbles through groups: a click on a node that is not selectable selects its nearest selectable group
 * ancestor. A group does not make its children indoor (shadows); only asset containers do. Its label sits at its origin.
 */
export interface GroupNode extends NodeBase, MotionFields {
  kind: 'group';
}

/** A box standing on the node origin: `size` is width (x), height (y) and depth (z) in metres. */
export interface BoxShape {
  type: 'box';
  /** Width (x), height (y) and depth (z) in metres, each greater than 0. */
  size: readonly [width: PositiveMetres, height: PositiveMetres, depth: PositiveMetres];
}
/** A sphere resting on the node origin: its centre is `radius` above it. */
export interface SphereShape {
  type: 'sphere';
  /** Radius in metres, greater than 0. */
  radius: PositiveMetres;
}
/** A cylinder, cone or frustum standing on the node origin along +y. One radius may be 0 (a cone), not both. */
export interface CylinderShape {
  type: 'cylinder';
  /** Radius of the top face in metres, 0 or more. */
  radiusTop: Metres;
  /** Radius of the bottom face in metres, 0 or more. */
  radiusBottom: Metres;
  /** Height in metres, greater than 0. */
  height: PositiveMetres;
}
/** Geometry of a shape node; `type` selects its fields. */
export type ShapeGeometry = BoxShape | SphereShape | CylinderShape;
/** The geometry types of a shape node. */
export const SHAPE_TYPES = Object.freeze(['box', 'sphere', 'cylinder'] as const);

/**
 * A box, sphere or cylinder with a plain material, for charts, markers of your own and simple models. The shape stands
 * on its origin (its bottom centre is `position`), so a bar of height h at y = 0 rises from the ground. Equal geometry
 * types and proportions share one unit geometry scaled per node, so many shapes draw as one instanced batch. Without
 * `color` the shape shows the scene palette: its `state` color for `busy`, `warning`, `critical` and `inactive`, the
 * `accent` role otherwise. `opacity` below 1 makes it transparent: it casts no shadow and is never instanced.
 */
export interface ShapeNode extends NodeBase, MotionFields {
  kind: 'shape';
  /** The geometry: `{ type: 'box', size }`, `{ type: 'sphere', radius }` or `{ type: 'cylinder', radiusTop, radiusBottom, height }`. */
  shape: ShapeGeometry;
  /** Surface color, a CSS color. Default: the palette color described on `ShapeNode`. */
  color?: string;
  /**
   * Opacity from 0 (invisible, still pickable) to 1 (opaque, default).
   * @minimum 0
   * @maximum 1
   */
  opacity?: number;
}

/** Widest `LineNode.width`, in metres. Wider strokes are shapes. */
export const MAX_LINE_WIDTH = 5;
/**
 * A polyline through `points` in the node's local coordinates (`position`, `rotation` and `scale` apply; with `parentId`,
 * the container's). With `width` greater than 0 it is a solid tube of that diameter, lit like a shape, and pointer
 * events and selection hit it; with `width` 0 (default) it is a 1-pixel line that the pointer passes through. Without
 * `color` it uses the palette's `structure` role. Its label sits 0.3 m above its origin.
 */
export interface LineNode extends NodeBase {
  kind: 'line';
  /**
   * Points in metres in the node's local coordinates, at least two.
   * @minItems 2
   */
  points: readonly Vec3[];
  /** Line color, a CSS color. Default: the palette `structure` role. */
  color?: string;
  /**
   * Tube diameter in metres from 0 to 5; 0 (default) draws a 1-pixel line.
   * @minimum 0
   * @maximum 5
   */
  width?: number;
  /** Draw dashes instead of a continuous line. Default false. */
  dashed?: boolean;
}

/** Longest `TextNode.text`, in characters (Unicode code points). */
export const MAX_TEXT_LENGTH = 500;
/** Range of `TextNode.size`, the height of capital letters in metres. */
export const TEXT_SIZE_RANGE = Object.freeze({ min: .05, max: 20 });
/** `TextNode.size` when omitted: capital letters 0.4 m tall. */
export const DEFAULT_TEXT_SIZE = .4;
/** Horizontal alignments of a text node; see `TextNode.align`. */
export const TEXT_ALIGNS = Object.freeze(['left', 'center', 'right'] as const);
/** Horizontal alignment of a text node; see `TextNode.align`. */
export type TextAlign = typeof TEXT_ALIGNS[number];

/**
 * Text drawn in the scene: a flat panel in the node's local coordinates, or with `billboard` a sprite that always faces
 * the camera. The renderer draws it with the system font stack (the font of the projected labels) into a texture, so it
 * scales with the scene; it is not extruded geometry. The bottom of the text block sits on the node origin, and `align`
 * decides whether the origin is at its left end, centre or right end. A flat text faces +z and reads mirrored from behind.
 * Line breaks (`\n`) start new lines; there is no automatic wrapping. Without `color` it uses the palette `text` role,
 * else the theme's text color. Text is transparent: it casts and receives no shadow, is not covered by the glow
 * selection style and is never instanced. Pointer events and selection hit its whole rectangle. Canvas text is not
 * accessible text: put information that users must read in `label`, `entityId` details or host HTML as well. Text nodes
 * have no route or controller; put them in a group to move them. Its label sits 0.3 m above the text.
 */
export interface TextNode extends NodeBase {
  kind: 'text';
  /**
   * The text, 1 to 500 characters with at least one visible character; `\n` breaks lines.
   * @minLength 1
   * @maxLength 500
   * @pattern \S
   */
  text: string;
  /**
   * Height of capital letters in metres, from 0.05 to 20. Default 0.4. Lines are 1.75 times this apart.
   * @minimum 0.05
   * @maximum 20
   */
  size?: number;
  /** Text color, a CSS color. Default: the palette `text` role, else the theme's text color. */
  color?: string;
  /**
   * Face the camera from every direction (a sprite) instead of lying in the node's local x-y plane. A billboard keeps its
   * size in metres and ignores `rotation`. Default false.
   */
  billboard?: boolean;
  /** Where the node origin sits along the text and how lines align: `left`, `center` (default) or `right`. */
  align?: TextAlign;
}

/** Longest `ImageNode.src`, in characters; a data URL counts in full. */
export const MAX_IMAGE_SRC_LENGTH = 1_000_000;
/** Widest and tallest `ImageNode.size`, in metres. */
export const MAX_IMAGE_SIZE = 100;
/** Highest `ImageNode.anisotropy`; the renderer also caps it at what the graphics card supports. */
export const MAX_IMAGE_ANISOTROPY = 16;
/**
 * The URL forms `ImageNode.src` accepts: a relative URL (no scheme, for example `/images/logo.png` or `logo.png`), an
 * `http:`, `https:` or `blob:` URL, or a `data:image/…` URL; schemes in any letter case. Other schemes (`javascript:`,
 * `file:`, `ftp:` and the like), control characters (tabs and line breaks included) and leading or trailing spaces are
 * rejected. `validateScene` reports the reason; the scene JSON Schema uses the same expression.
 */
export const IMAGE_SRC_PATTERN = /^(?:[Hh][Tt][Tt][Pp][Ss]?:|[Bb][Ll][Oo][Bb]:|[Dd][Aa][Tt][Aa]:[Ii][Mm][Aa][Gg][Ee]\/|(?![A-Za-z][A-Za-z0-9+.-]*:))(?!\s)[^\u0000-\u001f\u007f]*(?<!\s)$/;

/**
 * A picture in the scene: a flat rectangle of `size` in the node's local coordinates, or with `billboard` a sprite that
 * always faces the camera. The bottom edge's centre sits on the node origin, and the image is stretched to `size`, so
 * give `size` the image's aspect ratio. The renderer loads `src` in the background and shows a neutral placeholder until
 * it arrives; a failed load keeps the placeholder and reports an error naming the node and the URL to `onError`. Images
 * load with `crossOrigin = 'anonymous'`, so an image from another origin needs a server that sends
 * `Access-Control-Allow-Origin`; same-origin, `data:` and `blob:` URLs need nothing. Equal `src` values share one
 * texture. Images are transparent where the picture is: they cast and receive no shadow, are not covered by the glow
 * selection style and are never instanced. Pointer events and selection hit the whole rectangle. An image is not
 * accessible content: describe essential information in `label` or host HTML. Image nodes have no route or controller;
 * put them in a group to move them. Its label sits 0.3 m above the image.
 */
export interface ImageNode extends NodeBase {
  kind: 'image';
  /**
   * The image URL: relative, `http:`, `https:`, `blob:` or `data:image/…`, at most 1,000,000 characters. See
   * `IMAGE_SRC_PATTERN` for the exact rule. Prefer raster images (PNG, JPEG, WebP); an SVG needs `width` and `height`
   * attributes to load in every browser.
   * @minLength 1
   * @maxLength 1000000
   * @pattern ^(?:[Hh][Tt][Tt][Pp][Ss]?:|[Bb][Ll][Oo][Bb]:|[Dd][Aa][Tt][Aa]:[Ii][Mm][Aa][Gg][Ee]/|(?![A-Za-z][A-Za-z0-9+.-]*:))(?!\s)[^\u0000-\u001f\u007f]*(?<!\s)$
   */
  src: string;
  /** Width and height in metres, each greater than 0 and at most 100. */
  size: readonly [width: ImageMetres, height: ImageMetres];
  /**
   * Face the camera from every direction (a sprite) instead of lying in the node's local x-y plane. A billboard keeps its
   * size in metres and ignores `rotation`. Default false.
   */
  billboard?: boolean;
  /**
   * Anisotropic filtering of the picture, an integer from 1 to 16: how many texture samples a pixel may take along a
   * slant. Raise it, for example to 8, for an image on a plane the camera sees at a slant, such as a sign on a wall, which
   * otherwise blurs. Higher values cost a little more graphics work for the pixels the image covers and no memory; the
   * renderer caps them at what the graphics card supports. Default 1, plain mipmapped filtering.
   * @minimum 1
   * @maximum 16
   * @multipleOf 1
   */
  anisotropy?: number;
}
/**
 * Metres, greater than 0 and at most 100.
 * @exclusiveMinimum 0
 * @maximum 100
 */
type ImageMetres = number;
