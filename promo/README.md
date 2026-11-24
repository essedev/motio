# Motio promo

Motio's promotional material, made with Motio: an ordinary project created with `motio init` (the `blank` starter), in the brand of `brand/README.md` (D-077). Every animation is Motio's own `spring()` and `interpolate()`, driven by the frame number.

```bash
make promo                                  # from the repository root: builds, renders everything
pnpm --dir promo dev                        # the preview
pnpm --dir promo render og-card teaser      # only some compositions
```

`render.ts` uses the Node API (`@motiojs/bundler`, `@motiojs/renderer`): it makes sure the teaser's music exists (below), then one bundle, every output into `out/` (ignored by git), then copies the two stills the repository uses to their places. Videos and the other stills are never committed.

| Composition | Size | Output | Used by |
|---|---|---|---|
| `og-card` | 1200x630 still | `out/og-card.png` | `website/public/og/motio-card.png` |
| `readme-banner` | 1280x320 still, rendered at 2x | `out/readme-banner.png` | `brand/motio-readme-banner.png`, top of both READMEs |
| `square-post` | 1080x1080 still | `out/square-post.png` | |
| `teaser` | 1920x1080, 30 fps, 21.8 s, with music (AAC) | `out/teaser.mp4` | |
| `teaser-vertical` | 1080x1920, the same scenes recomposed, the same music | `out/teaser-vertical.mp4` | |
| `mark-loop` | 240x240, a loop of the mark | `out/mark-loop.gif` (15 fps) | |
| `og-card-animated` | 1200x630, 3 s | | the card's entrance, for the preview |

## Where things come from

- The mark's geometry, palette and springs: `website/src/brand/mark.ts`, imported, never copied. The code colours: `website/src/brand/code-theme.ts`.
- Fonts: Anybody, Instrument Sans and IBM Plex Mono (SIL OFL 1.1) from the same Fontsource packages the website self-hosts, loaded with `@motiojs/fonts`, so no frame is captured before they are ready.
- The benchmark scene reads the table of `docs/ROADMAP.md` and the pinned version of `tools/oracle-render/package.json` at build time, with the website's own parser (`website/src/lib/perf-table.ts`); it fails to build if the table changes shape.
- The code scene shows `src/snippet/Hello.tsx` as it is (imported with `?raw`) and plays that same component next to it. Biome formats that file at 64 columns so it fits on screen.
- A still is the resting frame of a scene that plays in the teaser: `Root.tsx` shows the scene from frame 90 with a `<Sequence from={-90}>`.
- The teaser's music, `music/teaser.wav`: a "filter house" track synthesised by `music/generate.ts` (no samples), with accents on the mark, the speed cut and the end card. It is not in git: `render.ts`, `pnpm dev`, `pnpm still` and the integration test generate it first when it is missing or its generator changed (`music/ensure.ts`, about a second). `music/README.md` has its structure, its measurements and the alternatives (two other sketches, the first keys version, a version played on the piezo synth).

## Checks

`promo.integration.test.ts`, part of `make check` (about 15 s): it generates the music if needed, the project type-checks, `og-card` and a frame of `teaser` render at their sizes through the CLI, the music generator agrees with the teaser on length, frame rate and the spring of the cuts, and `motio check determinism` passes on 20 frames of the code scene. The test renders frames only, so it never encodes audio.
