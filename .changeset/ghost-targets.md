---
"@opsorama/three": minor
"@opsorama/objects": minor
---

Show what a viewer can pick up and where it can go. `renderer.setHighlights(list)` tints any number of nodes with a steady shell that pulses gently while motion runs, and the nodes stay clickable. A `PickTarget` can now show a ghost instead of a box: `ghost` names a scene node to copy with the nodes inside it, or a model to build (`{ asset, count?, options?, scale?, … }`), turned by `yaw` and colored by `color`; a target may stand at a world `position` instead of a node anchor. `bindMoveMode` shows a ghost of the unit at each target by default (`{ ghost: false }` keeps the boxes), and `moveTargetPick(target, unit)` builds such a target.
