---
"@opsorama/objects": minor
---

New `goods` object in the work-items kit: one real-size item of a type of goods, with `variant` `kitchen` (mug), `home` (table lamp), `outdoor` (camping lantern), `toys` (teddy bear), `tech` (headphones) or `sport` (basketball); its main body takes the surface role. `GOODS_KINDS`, `GOODS_ITEMS` and the `GoodsKind` type are exported. The new `options.goods` on `store-shelving`, `shopping-cart`, `hand-basket`, `put-wall` and `tote` fills their counted items with that type's item, scaled to each slot, so a shelf or container holds one type of goods; without it they keep their neutral boxes.

The items' body tones, `GOODS_TONES` (red mug, purple lamp shade, green lantern, brown teddy bear, blue headphones, orange basketball), differ enough to serve as a color code per type of goods. `carton-flow-rack` cartons now take the surface role (`materials.surface`, then the scene palette; `color` stays the frame), so a pick face can show the color of its goods.
