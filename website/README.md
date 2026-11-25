# Motio website

The landing page and the documentation, built with Astro and Starlight, to be served at https://motio.esse.dev. Nothing is deployed yet.

```bash
make site          # dev server: http://localhost:4321
make site-build    # static build in website/dist, then the link check
make brand         # regenerate brand/ and the icons
make promo         # render the Open Graph card (and the rest of promo/) with Motio
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

## Repository and host

- `REPO_OWNER` in `src/lib/repo.ts` (`essedev`, like `RELEASE_OWNER` in `@motiojs/ffmpeg`): GitHub and edit links.
- `SITE_URL` (`https://motio.esse.dev`, or `MOTIO_SITE_URL` at build time): canonical and Open Graph URLs.
- `NPM_PUBLISHED` in `src/lib/repo.ts`: false until the packages are on npm; while false the landing shows `pnpm create motio` without a copy button and links to the guide's way of trying Motio from a clone.
- `public/og/motio-card.png`: one 1200x630 card shared by every page, rendered by Motio from `promo/` (`make promo`, composition `og-card`). Cards per page would point `og:image` in `src/layouts/Landing.astro` and `astro.config.mjs` at new images.
