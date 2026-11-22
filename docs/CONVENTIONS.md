# Conventions

Project-specific rules. Prose in English everywhere (public repository).

## Code

- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`; no `any` without a comment saying why.
- ESM only. Relative imports inside a package carry the `.js` extension (NodeNext resolution).
- Filenames kebab-case; one concern per file; tests co-located as `*.test.ts(x)`.
- Public exports are named, listed explicitly in each package's `src/index.ts`, and carry a JSDoc summary.
- Browser packages (`core`, `media`, `player`, feature packages) never import Node built-ins.
- Errors that reach users are `MotioError` instances with a stable `code` (`E_READINESS_TIMEOUT`, `E_PROTOCOL_MISMATCH`, ...), a message that says what to do, and structured context (frame, label, composition). No silent catches.
- Compatibility behaviour comes from Remotion's public docs and from oracle recordings, never from Remotion's source, type declarations or source maps.
- Ported code keeps its original copyright header and licence and gets a `NOTICE` entry.

## Tests

- Vitest. Unit tests in Node; component tests in jsdom; integration tests run serially against the pinned Chrome and the system FFmpeg and are tagged so they can run alone (`pnpm test:integration`).
- Oracle fixtures and golden frames change only through their record command, in a separate commit that states why. Never regenerate a golden to make a failing test pass.
- Determinism is asserted on decoded frame hashes, never on encoded file bytes.

## Formatting

- Biome, tabs, line width 100. Markdown is not formatted by Biome.
