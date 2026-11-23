---
"@opsorama/three": patch
"@opsorama/objects": patch
---

Require three.js 0.187 (`three: ^0.187.0` as the peer dependency, previously `^0.180.0`). The renderer and the object catalog are built and tested against 0.187; the starters install it.

With three.js 0.187, `getDiagnostics().textures` also counts the lookup texture that three.js keeps for lit (standard and physical) materials, so a scene without texture nodes can report one texture; compare counts against a baseline.
