---
"@opsorama/objects": patch
---

`shelf` and `carton-flow-rack` now hold the carton of a `pallet` (0.343 × 0.33 × 0.30 m, with its tape, sticker and barcode), as many as fit. A filled shelf slot holds twelve cartons (two across, three deep, two high) instead of one large box or tote, and the shelf's `count` is labelled as filled slots; the shelf no longer uses the accent and trim roles. A filled flow lane holds four cartons end to end instead of two smaller ones, and the flow rack is 1.25 m deep instead of 1.2 m so they fit between its beams (`FLOW_RACK.depth`, new `FLOW_RACK.cartons`); its label surface moved forward with the header.

`roll-cage` and `hold-cage` hold the same carton. A roll cage fits two across, two deep and four layers, so its `count` now goes up to 16 parcels instead of 12; a hold cage keeps its eight item slots, each with one carton.
