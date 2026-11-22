---
"@opsorama/three": minor
"@opsorama/react": minor
"@opsorama/vue": minor
---

Add opt-in touch gestures. The mount-time renderer option `touchGestures` (default false) and the `touchGestures` prop of the React and Vue `SceneCanvas` (changing it remounts the renderer) set `touch-action: none` on the canvas, restored on dispose, and handle touch: one finger pans the view over the ground and ends following; two fingers pinch-zoom `SceneSettings.zoom` within `ZOOM_RANGE`, written at most once per animation frame, while the ground point between them stays in place (while following a node the pinch zooms around it and following continues); with `camera.controls: 'orbit'` a two-finger twist turns the yaw and a two-finger vertical drag the pitch. A touch that moves less than 5 px still selects, and a gesture interrupts camera transitions and paths like a mouse drag. Without the option the canvas sets no `touch-action`, so pages with embedded scenes keep scrolling over them, and a tap selects as before. Pens now behave like a mouse: a pen press drags or clicks and a barrel-button drag orbits with orbit controls.
