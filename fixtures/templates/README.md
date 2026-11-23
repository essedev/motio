# Official Remotion templates

Proof for the M2 criterion "three official Remotion templates build through the alias with zero edits and render within the M1 thresholds". The templates are the starters `npx create-video` offers, published as public repositories under `github.com/remotion-dev/template-*`.

Nothing from the templates is committed. `templates.json` pins each one to a commit, and `fetch.ts` checks it out into `.cache/<name>` (gitignored) with `git fetch --depth 1` of that commit, verifying the hash. The commits are the heads of 2026-11-02 to 2026-11-18, the releases that go with `remotion@4.0.545` (published 2026-11-18), the compatibility target.

```sh
node fixtures/templates/fetch.ts [name...]          # fetch (the tests do it themselves)
pnpm --dir tools/oracle-render record:templates     # re-record Remotion's reference stills
pnpm vitest run --project integration packages/cli/src/templates.integration.test.ts
```

## How a template runs on Motio unmodified

The template directory gets no install and no edit: not its sources, not `remotion.config.ts`, not `package.json`. Its bare imports resolve, by ordinary Node resolution, from `fixtures/templates/node_modules`, the parent directory. This package depends on `motio`, the `@motiojs/*` packages the templates map to and the third-party versions they pin (React 19.3.1, Zod 4.6.7), so the compat alias sends `remotion` and `@remotion/*` to Motio and the bundler's `resolve.dedupe` leaves one React. The test checks that no module of the bundle comes from a `remotion` or `@remotion/*` package and that React and React DOM have one copy each. It bundles like the CLI (config loaded, entry found by convention) and also runs `motio compositions --json` inside the template.

Reference stills come from `tools/oracle-render/record-templates.ts`: it copies the template's `src/`, `public/` and `package.json` unchanged next to the pinned Remotion and renders with its Node APIs at scale 1 (below 1 the two renderers rasterise differently, see `docs/DECISIONS.md` D-025). As the templates' own READMEs note, the Node APIs do not apply `remotion.config.ts`; the stills do not depend on it.

## Templates

| Template | Pinned commit | Result on Motio |
| --- | --- | --- |
| [Blank](https://github.com/remotion-dev/template-empty) (`empty`) | `16562d5` | Metadata matches; the still is identical. |
| [Hello World (JavaScript)](https://github.com/remotion-dev/template-helloworld-javascript) | `f3c1be7` | Metadata matches; every still is identical, `OnlyLogo` (transparent) included since D-041. |
| [Still](https://github.com/remotion-dev/template-still) | `5487596` | Metadata (with Zod schema props) and still match (SSIM 0.9997, PSNR 49.8 dB). Loads Inter from Google Fonts while rendering. |
| [Overlay](https://github.com/remotion-dev/template-overlay) | `5f61771` | Metadata matches; both stills are identical (frame 30 since D-041). Loads Roboto from Google Fonts while rendering. |
| [Hello World](https://github.com/remotion-dev/template-helloworld) | `01cb8eb` | Metadata matches; every still is identical, `Logo` (transparent) included since D-041 (it was the D-031 mismatch). Uses `Interactive`, `Easing.spring` and string `interpolate()` with `output: "perceptual-scale"`. |
| [TikTok](https://github.com/remotion-dev/template-tiktok) | `1d2bffa` | Does not build: `@remotion/animation-utils` (M5) and `@remotion/media` (M3); the compat plugin names the package and its milestone. |
| [Three](https://github.com/remotion-dev/template-three) | `6915403` | Does not build: `@remotion/three` (M5) and `@remotion/media` (M3), same message. |

Not used: templates built on packages outside Motio's scope or needing services (Skia, Code Hike with `@remotion/studio`, Audiogram and Music Visualization on `@remotion/media`, the Next.js, React Router, Electron, Vercel and render-server apps, prompt-to-video), and the obsolete Tailwind template.

`templates.json` marks the exceptions the test expects: `blockedBy` (build fails on a missing symbol; none at the moment), `unsupported` (build fails with the compat message) and `knownMismatch` (a still misses the thresholds, with the reason; none at the moment, the D-031 ones were fixed by D-041). Each such test is written to fail once the cause is fixed, so the marker has to be removed then.

## Licences

The templates carry no open-source licence: `package.json` says `UNLICENSED` (npm's marker for a private project) and the READMEs point to the Remotion License, which is free for individuals and requires a company licence for some companies. `template-three` alone ships an MIT `LICENSE.md`. Nothing here copies or redistributes template code: the tests fetch the public repositories at run time and keep them in a gitignored cache, and the committed reference stills are Remotion's renders of them, produced by the author as an individual like every oracle recording (D-009). No template's terms forbid this use.
