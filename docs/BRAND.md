# Opsorama brand

Adopted October 28, 2026, at the user's request. The selected symbol is **Flow** (original concept 3). After comparing palettes against the documentation, the user selected **Cornflower blue** (color proposal 2). This palette supersedes the initial teal and subsequent violet treatments; the Flow silhouette stays the same.

## Name and message

- **Name:** Opsorama. Use this capitalization in prose and UI; use lowercase `opsorama` in package identifiers.
- **Pronunciation:** **ops-oh-RAH-ma**, with the stress on “RAH”.
- **Origin:** operations + panorama: a clear view of everything happening across a business.
- **Tagline:** A clear view of your operations.
- **Description:** A framework-agnostic toolkit for animated 3D operational dashboards across commerce, logistics, HR and other domains. React, native Vue and plain JavaScript share the same scene model and renderer.
- **Voice:** clear, practical and calm. Explain operational meaning with concrete language. Label mock data, proposed capabilities and measured results honestly.

## Visual identity

The **Flow** mark is a folded, open path with an offset left segment and a shaded right fold. The continuous direction and intentional breaks suggest connected operations, movement and handoffs. The production SVGs are geometric adaptations of the selected image concept; they use flat fills and one shaded fold rather than raster texture. The identity is static and works with motion disabled.

| Color | Hex | Use |
| --- | --- | --- |
| Ink / blue 900 | `#263C59` | Wordmark, headings, shaded fold and favicon background |
| Cornflower / blue 600 | `#4C70A6` | Main symbol and primary actions with white text |
| Supporting blue / blue 200 | `#C6D5EB` | Selected surfaces and light symbol on ink |
| Peach / peach 300 | `#DDB59D` | Small decorative accent |
| Body text / slate 600 | `#4D688C` | Body, muted and code text; slightly darker than the earlier `#567399` |
| Documentation panel / blue 100 | `#E5EBF5` | Retained documentation panel background |
| Site background / slate 50 | `#F8FAFD` | Supporting website background |

Use ink for headings, slate 600 for body/code and blue 700 for links. Blue 600 supports white button labels; on muted documentation panels use the darker link role rather than the primary-action role. Supporting blue and peach are decorative colors, not body-text colors. Success, warning and danger have separate website foreground/surface roles. Warning HTML labels keep their warning meaning with stronger contrast, including when selected. Renderer material palettes and host business-state colors remain independent of website branding.

## Intensities and implementation

This palette belongs to the **example website**, including its documentation and catalog interface. Its standalone `/brand` page is linked from the documentation and examples footers, outside the toolkit documentation navigation, search and previous/next sequence. The former `/docs/brand` URL redirects there.

Catalog objects retain their designed appearances and asset-specific material roles. A real dashboard can supply its own scene palette, for example a company's colors, plus supported per-object customizations. Each object applies the roles it supports. Website tokens are not an object color contract or a required corporate palette.

The source of truth is [`palette.json`](../apps/site/src/features/brand/palette.json). Blue, slate and peach each have **11 intensities: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 and 950**. Success, warning and danger each have five intensities (50, 100, 500, 700 and 900), for **48 swatches** plus white. See `/brand` for the complete live example-website palette and its main roles.

- 50–200: pale surfaces and supporting fills.
- 300–400: decoration, supporting graphics and light symbols on dark backgrounds.
- 600: primary actions and body text, depending on the family.
- 700–950: links, stronger text and dark treatments.

These are usage guides, not a guarantee that arbitrary pairs pass contrast. Website styles consume `--opsorama-*` role tokens, such as `--opsorama-text`, `--opsorama-link`, `--opsorama-surface-muted` and `--opsorama-border-control`. Roles and shades are website implementation details, not toolkit exports. Existing global `--ink`, `--muted`, `--blue`, `--line` and `--green` variables resolve to those roles.

After editing the JSON, run `pnpm colors:generate` to update the committed [`palette.css`](../apps/site/src/app/palette.css). Run `pnpm check:colors` to verify generated CSS, monotonically darker intensity scales, token references, SVG color membership and the declared contrast pairs. `pnpm test` runs this check before the unit suite. The check also writes the project color inventory to `artifacts/brand/color-audit.json`. See the [color audit](COLOR_AUDIT.md) for results, boundaries and remaining context-dependent checks.

Use the existing system sans-serif stack (`Inter`, `Segoe UI`, Arial, sans-serif) for the website. No font download is required. Keep the wordmark bold with modestly tightened spacing.

## Assets and use

- [SVG mark](../apps/site/public/brand/opsorama-mark.svg): used in the site header and as the favicon. Supporting blue 200 and blue 400 sit on ink; the secondary segment has 4.11:1 contrast against the background. Minimum ordinary display size: 24 × 24 CSS pixels; favicon rendering is the small-size exception.
- [Standalone SVG symbol](../apps/site/public/brand/opsorama-symbol.svg): cornflower blue with a shaded fold on a transparent background, intended for light surfaces.
- [Monochrome SVG symbol](../apps/site/public/brand/opsorama-monochrome.svg): the same silhouette in `currentColor`. Inline it to inherit the surrounding text color; as an image it defaults to black. Omit the shaded fold in one-color uses.
- [SVG lockup](../apps/site/public/brand/opsorama-lockup.svg): mark, wordmark and tagline for the README and other light-background placements. Text uses system fonts; its exact metrics depend on the viewer's installed fonts.
- Keep clear space around the mark of at least one quarter of its width. Do not stretch, rotate, animate or recolor individual segments outside the supplied variants.
- Supply an accessible name when the mark is the only content of a link. When the visible wordmark accompanies it, the mark is decorative.

## Repository identifiers and publication

The root application is `opsorama-workspace`. The private local packages are `@opsorama/core`, `@opsorama/renderer-three`, `@opsorama/react`, `@opsorama/vue` and `@opsorama/ui`. Imports, exports, documentation snippets and workspace dependency declarations use these names together.

The owner is **Tomas Jirsa**; use this spelling without diacritics in attribution. The public contact is [contact@opsorama.dev](mailto:contact@opsorama.dev), and the owner-confirmed project domain is **opsorama.dev**. The canonical repository is [tomulin1/opsorama on GitHub](https://github.com/tomulin1/opsorama). The website header links to the repository; its documentation, examples, home and brand footers include repository and contact links. Shared website values live in `apps/site/src/features/brand/project.ts`.

The package names remain local workspace identifiers. npm scope ownership, registry availability and trademark clearance have not been checked. The domain and repository do not imply that a public website is deployed or npm packages are published. Those release steps remain in the [roadmap](ROADMAP.md).

## License and attribution

The supplied original brand SVGs are covered by the project's [MIT License](../LICENSE), adopted November 4, 2026. The visual identity guidance above describes preferred presentation and does not add conditions to that license. An on-screen logo or project link is optional; the copyright and permission notice must be retained as the license specifies. Third-party material retains its own licenses and notices.
