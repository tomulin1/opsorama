---
"@opsorama/three": patch
---

An unknown asset name now names the closest registered asset when it is a likely typo: `Unknown asset: forklif. Did you mean forklift?`. The message reaches `assetValidator`, `validateScene` problems and render errors.
