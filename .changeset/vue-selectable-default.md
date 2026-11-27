---
"@opsorama/vue": patch
---

Node components leave `selectable` unset when it is not given. Vue had passed `false` for the missing Boolean prop, which keeps a node with an `entityId` out of clicks and label selection.
