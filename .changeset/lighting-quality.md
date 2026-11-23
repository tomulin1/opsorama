---
"@opsorama/core": minor
"@opsorama/three": minor
---

Add lighting presets, sky, fog and quality profiles as scene settings. `lighting` chooses `studio` (the default and the original look), `daylight`, `overcast`, `dusk` or `night`; each preset sets the ambient and sun light, the exposure, the background and the sky and fog colors, with a light and a midnight variant. `sky` draws a gradient backdrop, and `fog` fades distant parts into the horizon or background color with a range that follows the camera distance. `quality` (`high` by default, `balanced`, `low`) caps the canvas pixel ratio at 2, 1.5 or 1 and sets the shadow map to 2048 or 1024 px with soft edges, or 512 px with hard edges. None of them rebuilds a model. Node previews use the same lights and pixel ratio cap. `@opsorama/core` exports `LIGHTING_PRESETS`, `QUALITY_LEVELS` and the types `LightingPreset` and `QualityLevel`; invalid values are rejected with the allowed list.
