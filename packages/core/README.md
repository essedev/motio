# @motiojs/core

The engine of [Motio](https://motio.esse.dev): the timeline, hooks, components and animation functions, plus the browser runtime of a rendered page. It runs unchanged in the Player and in the renderer and uses no Node API.

Projects do not import it directly: [`@motiojs/motio`](https://motio.esse.dev/reference/packages/motio/) re-exports its public API (`useCurrentFrame`, `Sequence`, `Composition`, `interpolate`, `spring` and the rest), and its page documents it.

```bash
pnpm add @motiojs/motio
```

## Subpath exports

The other Motio packages use these entry points:

| Export | Role |
|---|---|
| `@motiojs/core` | The public API that `@motiojs/motio` re-exports. |
| `@motiojs/core/no-react` | The animation helpers that do not import React, for code outside a React tree (Node scripts, workers); re-exported as `@motiojs/motio/no-react`. |
| `@motiojs/core/config` | The types and `defineConfig` of `motio.config.ts`, with no runtime dependency, so a config file loads without React; re-exported as `@motiojs/motio/config`. |
| `@motiojs/core/version` | `VERSION` (Motio's version) and `REMOTION_API_VERSION` (the Remotion API version Motio implements). |
| `@motiojs/core/runtime` | `mountPage()`, which the page built by `@motiojs/bundler` calls to collect the compositions and answer the renderer. |
| `@motiojs/core/protocol` | The types and version of the contract between a rendered page and the Node renderer. |
| `@motiojs/core/frame-gate`, `@motiojs/core/clock-shim` | The scripts the renderer injects into a page for the frame and the virtual time model. |
| `@motiojs/core/internals` | Building blocks for other Motio packages (the Player, media components, feature packages); not part of the Remotion-compatible API. |

## Compatibility

`remotion` corresponds to `@motiojs/motio`, built on this package; the compat alias maps `remotion` to `@motiojs/motio/remotion`.

Documentation: [motio.esse.dev/reference/packages/core](https://motio.esse.dev/reference/packages/core/) · Guide: [Frames and time](https://motio.esse.dev/guide/frames-and-time/) · Source: [packages/core](https://github.com/essedev/motio/tree/main/packages/core)
