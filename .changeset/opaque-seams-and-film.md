---
"@opsorama/objects": patch
---

Parcel seams (on `parcel`, `parcel-base` and `pallet` boxes) and the stretch film on `pallet-rack` and `stretch-wrapper` loads are now opaque, in the tone the transparent overlay gave before. They merge and instance with the rest of the model, which removes thousands of separate draw calls from scenes with many pallets.
