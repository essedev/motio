# Production projects built on Remotion

Proof for the M4 criterion: every video of a production Remotion project renders with no source changes, `doctor` reports no missing symbol, the renders match the project's Remotion renders within the M1 thresholds and pass the flicker check. The projects, chosen by the author, are third-party and MIT:

| Project | What it is | Pinned commit |
| --- | --- | --- |
| [Remocn](https://github.com/Remocn/remocn) | A shadcn-style registry of animations, transitions, backgrounds, scenes and full templates, with a Next.js documentation site | `7ddf6a8` (head of 2026-11-24) |
| [snapcn](https://github.com/shadcn-labs/snapcn) | Product demo components (UI scenes for launch videos), with a Next.js documentation site | `3f09f3a` (head of 2026-11-20) |

Nothing from the projects is committed. `projects.json` pins each one to a commit and `projects.ts` checks it out into `.cache/<name>` (gitignored) with `git fetch --depth 1` of that commit, verifying the hash.

```sh
node fixtures/projects/projects.ts [name...]                      # fetch (the test and the oracle do it themselves)
pnpm --dir tools/oracle-render record:projects [project[/entry]...]  # record Remotion's references locally
MOTIO_PROJECTS=all pnpm vitest run --project integration packages/cli/src/projects.integration.test.ts
```

The suite renders hundreds of compositions and takes hours, so it runs only with `MOTIO_PROJECTS` set (`all`, or a list such as `remocn/demos,snapcn`), and it skips with a message when the references are not recorded. A run writes its measurements to `.cache/results/<project>.json`.

## What a video is here

Both repositories are documentation sites. Their videos are the compositions registered by the files under `src/remotion/` that call `registerRoot`, each bundled by one of the project's scripts (`scripts/render-*.mts`, `scripts/review-*.mts`) or by Remotion Studio with `remotion.config.ts`. `projects.json` lists every such entry with the script that bundles it; every composition of every entry is measured. Entries that are not measured are listed under `excluded` with the reason: in snapcn, eleven import `registry/snap-cn-pro`, the paid tier, which the public repository does not contain.

## How a project runs on Motio unmodified

The project directory gets no install and no edit. Its bare imports resolve, by ordinary Node resolution, from `fixtures/projects/node_modules`, the parent directory: `@motiojs/motio`, the `@motiojs/*` packages the videos import (Google Fonts, transitions, paths, captions, Zod types) and the third-party packages they use (Paper shaders, Lucide, culori, Fontsource, Tailwind and the CSS packages snapcn's stylesheet imports). Where the two projects pin different versions of a package, the higher one is used; the oracle uses the same versions, so both renderers draw the same third-party code. The bundle is made like the CLI makes it, with the project's `remotion.config.ts` loaded and the entry passed as the project's scripts pass it.

## How the references are recorded

`tools/oracle-render/record-projects.ts` copies the project, without `.git`, next to the pinned Remotion (4.0.545, the compatibility target; the projects pin 4.0.542) and bundles each entry the way the project's script does: webpack aliases from the project's `tsconfig.json` paths, computed by the project's own `scripts/tsconfig-webpack-alias.mts`, and `enableTailwind()` where the script calls it. It lists the compositions, then renders PNG stills at scale 1 on the frames `sampleFrames()` picks (first, last and three evenly spaced). Both renderers use `gl: "swangle"`: several project scripts ask for `angle`, which uses the GPU and differs per machine (D-046). Remotion's failures are recorded too (an entry it cannot bundle, a frame it cannot render), and the test skips those instead of holding Motio to them.

## What the test checks

For each project, `doctor` in the project directory. For each entry: it builds through the alias with no `remotion` or `@remotion/*` module and one React; the compositions and their resolved metadata equal Remotion's. For each composition: the sampled stills against Remotion's (mean SSIM at least 0.99, PSNR at least 40 dB, worst frame SSIM at least 0.97), `motio check flicker` over every frame, and `motio check determinism --reference fresh` on 20 frames around the middle.

## Licences

Both projects are MIT (Remocn: copyright 2026 Remocn; snapcn: copyright 2026 Sri Nath). Nothing is copied: the test and the oracle fetch the public repositories at run time into ignored directories, and Remotion's renders of them stay in the ignored cache, produced by the author as an individual like every oracle recording (D-009). If a file is ever copied from them, it keeps its MIT notice.
