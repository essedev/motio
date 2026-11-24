# Motio website

The landing page and the documentation, built with Astro and Starlight. Nothing is deployed yet.

```bash
make site          # dev server: http://localhost:4321
make site-build    # static build in website/dist, then the link check
make brand         # regenerate brand/, the icons and the Open Graph card
```

## Where the content comes from

Nothing is copied into the site: `src/lib/docs-loader.ts` reads the repository at build time.

- **Guide**: `docs/guide/*.md`, the single source. The title is the page's H1; the `<!-- example: ... -->` markers are dropped; relative links are rewritten to site routes (other repository files link to GitHub) by `src/lib/repo-links.ts`. The sidebar follows the numbered list of `docs/guide/README.md`.
- **CLI reference**: one page per command, generated from the CLI's own command table (`COMMANDS` of `@motiojs/cli`, the data `--help` prints) and its JSON schemas.
- **Packages**: one page per published package that has a README.
- **Landing**: the benchmark numbers come from the table in `docs/ROADMAP.md`, the Badge code from `docs/guide/examples`, the package list from `packages/*/package.json`. The build fails if any of them changes shape.

## Checks

- `pnpm build` runs `scripts/check-links.ts` after Astro: every internal link and anchor of every built page must resolve, or the build fails. Links that leave the site are not fetched.
- `pnpm check` type-checks the Astro and TypeScript sources (`astro check`, with TypeScript 6 until it supports 7).

Both run in `make check`.

## Placeholders

- `REPO_OWNER` in `src/lib/repo.ts` (`OWNER_PLACEHOLDER`), like `RELEASE_OWNER` in `@motiojs/ffmpeg`: GitHub and edit links point to it until the repository is public.
- `SITE_URL` (`https://motio.example`, or `MOTIO_SITE_URL` at build time): canonical and Open Graph URLs.
- `public/og/motio-card.png`: a static 1200x630 card shared by every page. It is the slot for cards rendered by Motio itself; replace the file, or point `og:image` in `src/layouts/Landing.astro` and `astro.config.mjs` at the new images.
