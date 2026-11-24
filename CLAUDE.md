# Motio

Open-source (Apache-2.0) framework for making videos with React, compatible with Remotion's documented API. Renders in a pinned headless Chrome, captures frame by frame, encodes with the system FFmpeg or the optional pinned build of `@motiojs/ffmpeg` (D-065). Public repository: all prose in English.

Read first: `docs/ARCHITECTURE.md` (design and frame protocol), `docs/ROADMAP.md` (milestones and done criteria), `docs/DECISIONS.md`, `docs/CONVENTIONS.md`.

## Commands

- `make check`: format, lint, build (`tsc -b`), tests. Must be green before every commit.
- `make build`, `make test`, `make lint`, `make format`, `make typecheck`.
- `pnpm test:integration`: tests against the real Chrome and FFmpeg (serial, slower).
- `make bench`: throughput against the pinned Remotion (`BENCH_ARGS="--assert"` checks the performance criterion; needs `pnpm install` in `tools/oracle-render`, which the target runs).
- `make site` (dev server, http://localhost:4321), `make site-build` (build plus link check, also part of `make check`), `make brand` (regenerates `brand/` and the icons from `website/src/brand/mark.ts`), `make promo` (renders the promotional material of `promo/`, a Motio project, into `promo/out/` and refreshes the OG card and the README banner).
- `pnpm --dir tools/oracle record`: re-record oracle fixtures from the published Remotion package (separate commit, state why).

## Layout

- `packages/*`: workspace packages (`@motiojs/motio` entry, `@motiojs/core`, `renderer`, `cli`, `compat`, `bundler`, `testing`, ...).
- `tools/oracle/`: standalone project that installs the pinned Remotion and records reference values. Outside the workspace.
- `fixtures/*`: compositions used by integration and golden tests.
- `website/`: landing and docs (Astro, Starlight). Pages are read from `docs/guide/`, the CLI's `COMMANDS` and schemas, and package READMEs at build time (`website/src/lib/docs-loader.ts`); never copy them into the site. `brand/`: generated brand kit. `promo/`: the promotional material, made with Motio.
- `spike/`: throwaway measurements behind D-005 and D-006; not shipped.

## Hard rules

- Clean room: never read Remotion's source, its `.d.ts` files or source maps, including under `tools/oracle/node_modules` and `github.com/remotion-dev` (any file other than the docs site). Behaviour comes from remotion.dev/docs and oracle outputs. Every brief given to a subagent or web fetcher repeats this rule and limits it to remotion.dev/docs pages (D-067).
- No code from Kinetograph (D-010). Code ported from Apache-2.0 projects keeps its header and gets a `NOTICE` entry.
- Goldens and oracle fixtures change only through their record command, never to make a test pass.
- Determinism is checked on decoded frame hashes, not on encoded bytes.

## Gotchas

- `chrome-headless-shell` is pinned (158.0.8127.36) and cached in `~/.cache/motio/browsers`.
- React must be deduplicated in user bundles (`resolve.dedupe`), or aliased packages load a second React.
- FFmpeg resolution: option, `MOTIO_FFMPEG`, `@motiojs/ffmpeg` if installed, `PATH` (also when the package cannot download its build, with `W_FFMPEG_FALLBACK`). The package is found by walking `node_modules`, never `require.resolve`: `pnpm exec` sets `NODE_PATH` to the hoisted store, where this workspace's own `@motiojs/ffmpeg` is visible.
- `tools/ffmpeg-build/` builds the GPL FFmpeg archives (not part of `make check`); archives go to its ignored `out/`, never into git. Do not edit `build.sh` while a build runs: `sh` reads it as it goes.
- The website needs `make build` first: it imports `@motiojs/core` and `@motiojs/cli` from their `dist`. `astro check` runs with the website's own TypeScript 6 (it does not support 7 yet).
- The clock shim never patches `MessageChannel`, `queueMicrotask` or `Promise`: React's scheduler depends on them.
