# Motio

Open-source (Apache-2.0) framework for making videos with React, compatible with Remotion's documented API. Renders in a pinned headless Chrome, captures frame by frame, encodes with the system FFmpeg. Public repository: all prose in English.

Read first: `docs/ARCHITECTURE.md` (design and frame protocol), `docs/ROADMAP.md` (milestones and done criteria), `docs/DECISIONS.md`, `docs/CONVENTIONS.md`.

## Commands

- `make check`: format, lint, build (`tsc -b`), tests. Must be green before every commit.
- `make build`, `make test`, `make lint`, `make format`, `make typecheck`.
- `pnpm test:integration`: tests against the real Chrome and FFmpeg (serial, slower).
- `make bench`: throughput against the pinned Remotion (`BENCH_ARGS="--assert"` checks the performance criterion; needs `pnpm install` in `tools/oracle-render`, which the target runs).
- `pnpm --dir tools/oracle record`: re-record oracle fixtures from the published Remotion package (separate commit, state why).

## Layout

- `packages/*`: workspace packages (`motio` entry, `@motiojs/core`, `renderer`, `cli`, `compat`, `bundler`, `testing`, ...).
- `tools/oracle/`: standalone project that installs the pinned Remotion and records reference values. Outside the workspace.
- `fixtures/*`: compositions used by integration and golden tests.
- `spike/`: throwaway measurements behind D-005 and D-006; not shipped.

## Hard rules

- Clean room: never read Remotion's source, its `.d.ts` files or source maps, including under `tools/oracle/node_modules`. Behaviour comes from remotion.dev/docs and oracle outputs.
- No code from Kinetograph (D-010). Code ported from Apache-2.0 projects keeps its header and gets a `NOTICE` entry.
- Goldens and oracle fixtures change only through their record command, never to make a test pass.
- Determinism is checked on decoded frame hashes, not on encoded bytes.

## Gotchas

- `chrome-headless-shell` is pinned (158.0.8127.36) and cached in `~/.cache/motio/browsers`.
- React must be deduplicated in user bundles (`resolve.dedupe`), or aliased packages load a second React.
- The clock shim never patches `MessageChannel`, `queueMicrotask` or `Promise`: React's scheduler depends on them.
