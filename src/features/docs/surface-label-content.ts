import type { DocSection } from './content';

export const surfaceLabelSection: DocSection = {
  id: 'surface-labels', title: 'Surface labels: text and SVG',
  paragraphs: [
    'surfaceLabel attaches static artwork to a model. It follows position, rotation and scale and selects the owning node. Supported built-in models are parcel, pallet, bag, tote, storefront, parcel-locker, returns-drop-box, delivery-van, truck, whiteboard, order-ticket, put-wall, label-printer, parcel-scale, poly-mailer, carrier-pickup-point, hold-cage, click-collect-counter, checkout-counter, store-shelving and customer-house. Each object page declares its placement and lets you try text or upload/paste SVG. Other built-in models reject this option.',
    'Text and SVG alternatives contain 1–80 characters on one line. Text fits the declared surface; default ink is #243650. Optional color and background use #RRGGBB. Omitting background makes the artwork transparent. The existing label and labelMode still control projected HTML text and quantity disclosure. Scene settings.labels controls HTML labels only; surface artwork remains visible and static with motion disabled.',
    'SVG accepts at most 20,000 characters and 512 static elements. Supply xmlns="http://www.w3.org/2000/svg", a finite positive viewBox bounded to 10,000 with at most a 100:1 aspect ratio, and a text alternative. Shapes, text, gradients and clipping with local url(#id) references are supported. Inline styles, external resources, images, scripts, events, use/href, nested SVG, animation, doctype and entities are rejected before decoding. Convert styled logos to presentation attributes and outline text when typography must match exactly. SVG is fitted without stretching; browser decode failure retains the alternative text.',
    'The store validates content limits and defensively copies/freezes the label. The renderer also validates SVG XML. Each instance owns one bounded texture and sticker meshes; repeated parcel artwork shares that texture within its node without creating identities or changing count × multiplier. Updates/removal/disposal release textures and cancel decoding callbacks and temporary Blob URLs. Remove the prop to restore the original appearance.',
    'Surface textures are decorative, so provide an accessible projected label or equivalent host HTML. SVG alt is a host-readable text alternative and decoding fallback; it does not create a DOM label. Custom factories may use applySurfaceLabel once per fresh model with an explicit finite LabelSurface and disposeObject for cleanup. The common palette and general anchor contract remain planned.',
  ],
  language: 'typescript',
  code: `import type { SurfaceLabel } from '@opsorama/core';

const name: SurfaceLabel = {
  kind: 'text', text: 'NORTH', color: '#243650', background: '#fffaf2'
};
const logo: SurfaceLabel = {
  kind: 'svg', alt: 'North logo',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16M12 4v16" stroke="#497bec" stroke-width="4"/></svg>'
};
// React: <Asset id="branch" asset="storefront" surfaceLabel={name} />
// Vue:   <Asset id="branch" asset="storefront" :surfaceLabel="name" />
// JS:    store.upsert({ id: 'branch', kind: 'asset', asset: 'storefront', surfaceLabel: logo });`,
};
