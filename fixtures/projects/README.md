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

Both repositories are documentation sites. Their videos are the compositions registered by the files under `src/remotion/` that call `registerRoot`, each bundled by one of the project's scripts (`scripts/render-*.mts`, `scripts/review-*.mts`) or by Remotion Studio with `remotion.config.ts`. `projects.json` lists every such entry with the script that bundles it; every composition of every entry is measured. Entries that are not measured are listed under `excluded` with the reason: in snapcn, eleven import `registry/snap-cn-pro`, the paid tier, which the public repository does not contain; in Remocn, a Player page, a code generator and `jitter-audit`, an audit tool that uses Remotion's private `Internals` and registers no composition.

## How a project runs on Motio unmodified

The project directory gets no install and no edit. Its bare imports resolve, by ordinary Node resolution, from `fixtures/projects/node_modules`, the parent directory: `@motiojs/motio`, the `@motiojs/*` packages the videos import (Google Fonts, transitions, paths, captions, Zod types) and the third-party packages they use (Paper shaders, Lucide, culori, Fontsource, Tailwind and the CSS packages snapcn's stylesheet imports). Where the two projects pin different versions of a package, the higher one is used; the oracle uses the same versions, so both renderers draw the same third-party code. The bundle is made like the CLI makes it, with the project's `remotion.config.ts` loaded and the entry passed as the project's scripts pass it.

## How the references are recorded

`tools/oracle-render/record-projects.ts` copies the project, without `.git`, next to the pinned Remotion (4.0.545, the compatibility target; the projects pin 4.0.542) and bundles each entry the way the project's script does: webpack aliases from the project's `tsconfig.json` paths, computed by the project's own `scripts/tsconfig-webpack-alias.mts`, and `enableTailwind()` where the script calls it. It lists the compositions, then renders PNG stills at scale 1 on the frames `sampleFrames()` picks (first, last and three evenly spaced). Both renderers use `gl: "swangle"`: several project scripts ask for `angle`, which uses the GPU and differs per machine (D-046). Remotion's failures are recorded too (an entry it cannot bundle, a frame it cannot render), and the test skips those instead of holding Motio to them.

## What the test checks

For each project, `doctor` in the project directory: it must report no missing symbol; what Motio skips by design (`@remotion/studio-protocol`, which the sites use to talk to Remotion Studio, and Remotion's private `Internals`) is a warning. For each entry: it builds through the alias with no `remotion` or `@remotion/*` module and one React; the compositions and their resolved metadata equal Remotion's. For each composition:

- the sampled stills against Remotion's: mean SSIM at least 0.99, PSNR at least 40 dB, worst frame SSIM at least 0.97, and no 32x32 block whose mean absolute difference exceeds 8 code values (`MAX_BLOCK_DIFFERENCE` in `@motiojs/testing`, shared by every comparison with Remotion);
- `motio check flicker` over every frame, at scale 0.5 (it compares Motio's consecutive frames with each other, and half the size finds the same jumps in a quarter of the pixels). The check also flags content that changes faster than its 16 px blocks, a rolling digit or a shake; a flagged frame counts as the content's own when Motio draws it and both its neighbours like Remotion does, which needs Remotion's frames around it (`record:projects --around-flagged`, after a run has written the flagged frames to the results);
- `motio check determinism --reference fresh` on 10 frames around the middle.

## What is left out, and known differences

`projects.json` records, per entry, compositions left out (`skip`) and differences with a known cause (`knownMismatch` for stills, `knownFlickerMismatch` for the frames around flagged flicker). A known mismatch runs as an expected failure, so it fails once the cause is fixed and the marker has to come out.

- Left out: content that is external and random or rate-limited (Remocn's `backdrop-image` loads a random picsum.photos photo; `github-stars` and the three chat flows load avatars from unavatar.io, which answers repeated renders with HTTP 429) and files the repository does not contain (`release-demo` plays `public/clips/*.mp4`). Remotion itself fails on 31 Remocn compositions (30 call `captureElementImage` in a way Chrome 158 refuses, one uses a missing file in `public/`); the test skips them with Remotion's error.
- No known mismatch is left. The references are recorded with `gl: "swangle"`, with which Remotion rasterises on the GPU (SwiftShader); the test renders with the same `gl`, so Motio uses its GPU raster too (`raster` option, see the guide's configuration page). With the CPU raster, Motio's default otherwise, 21 compositions missed the still thresholds and 6 drew the frames around flagged flicker unlike Remotion, all at the antialiased edges of thin strokes, text and borders (eight generative pieces of Remocn's motion pack down to 31.5 dB, `design-audit`, the launch templates and eleven snapcn compositions); with the GPU raster 148 of the 186 measured compositions are identical to Remotion's stills.

## Licences

Both projects are MIT (Remocn: copyright 2026 Remocn; snapcn: copyright 2026 Sri Nath). Nothing is copied: the test and the oracle fetch the public repositories at run time into ignored directories, and Remotion's renders of them stay in the ignored cache, produced by the author as an individual like every oracle recording (D-009). If a file is ever copied from them, it keeps its MIT notice.
