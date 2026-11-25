---
"@opsorama/ui": minor
"@opsorama/react": minor
"@opsorama/vue": minor
---

New action ring for giving commands to the object picked in a scene: `actionRing` in `@opsorama/ui` (render it with `mountPanel`), `ActionRing` in `@opsorama/react/ui` and `@opsorama/vue/ui`. It draws a few command pills in a gentle arc over a name pill, as a toolbar of native buttons with tones, switches (`pressed`), disabled actions and icon-only pills (`ariaLabel` and `icon` without `label`). Place it over a node with `NodeHtml` or `renderer.attachHtml`; it is meant for commands, while details belong in a panel. The styles come with `@opsorama/ui/styles.css` and read `--ring-*` and the panel color variables.
