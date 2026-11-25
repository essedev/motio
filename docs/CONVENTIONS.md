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
- Only someone entitled to run Remotion records the oracle: an individual or an organization of up to 3 people under Remotion's free licence, otherwise a company licence holder (D-066). Documentation and examples are written from Motio's code, never copied or closely paraphrased from remotion.dev.
- Ported code keeps its original copyright header and licence and gets a `NOTICE` entry.

## Naming Remotion

Remotion is a trademark of its owner, and Motio is an independent project. Every text a user can read (package descriptions and READMEs, the guide, the site, CLI messages, release notes) names Remotion only to state a fact about compatibility or behaviour:

- Say "compatible with the `@remotion/x` API", "behaves like Remotion's `bundle()`", "matches Remotion's output within the thresholds". A package description ends with "Compatible with the `@remotion/x` API".
- Never present Motio or a package as a mirror, clone, copy, port, fork or replacement of Remotion, and never imply an affiliation or endorsement.
- Use the name in plain text: no Remotion logo, colours or visual identity.

## Tests

- Vitest. Unit tests in Node; component tests in jsdom; integration tests run serially against the pinned Chrome and the system FFmpeg and are tagged so they can run alone (`pnpm test:integration`).
- Oracle fixtures and golden frames change only through their record command, in a separate commit that states why. Never regenerate a golden to make a failing test pass.
- Determinism is asserted on decoded frame hashes, never on encoded file bytes.

## Formatting

- Biome, tabs, line width 100. Markdown is not formatted by Biome.
