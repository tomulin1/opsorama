# Third-party notices

Reviewed November 5, 2026 with `pnpm licenses list --prod` and an inspection of the package builds.

## Published packages

The `@opsorama/*` packages contain only original Opsorama code under the [MIT License](LICENSE). Their builds bundle no third-party code: `three`, `react` and `vue` (all MIT) stay external peer dependencies, including the `three/examples/jsm` modules the object catalog imports (`RoundedBoxGeometry`, `BufferGeometryUtils`). Models are procedural; no third-party meshes, textures or fonts are included.

## Documentation website

The website (`apps/site`, not published as a package) is built with these main components, each under its own license:

| Component | License |
| --- | --- |
| Next.js, React, React DOM, Vue, three.js | MIT |
| lucide-react (interface icons) | ISC |
| Tailwind CSS (build tooling) | MIT |
| caniuse-lite (browser data used by build tooling) | CC-BY-4.0 |
| sharp and its libvips binaries (optional Next.js image tooling, not used by the static export) | Apache-2.0, LGPL-3.0-or-later |

Other transitive dependencies are under MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause or 0BSD. Brand SVGs in `apps/site/public/brand` are original Opsorama assets under the MIT License.
