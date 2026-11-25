# @motiojs/google-fonts

Google Fonts for [Motio](https://motio.esse.dev), with one generated module per family and typed weights and subsets. Loading a font holds the render until its files are ready.

```bash
pnpm add @motiojs/google-fonts
```

<!-- example: ../../docs/guide/examples/src/fonts-google.tsx -->
```tsx
import { loadFont } from "@motiojs/google-fonts/Inter";

// Downloads from Google Fonts when the page loads; only the weights and subsets you name.
const { fontFamily } = loadFont("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const Body = () => <p style={{ fontFamily }}>Text in Inter</p>;
```

Import a family from `@motiojs/google-fonts/<ImportName>` (`Inter`, `Roboto`, `PlayfairDisplay`, ...). Each module exports:

| Export | What it does |
|---|---|
| `loadFont(style?, options?)` | Loads the font and returns `fontFamily` and `waitUntilDone()`. Without a style (`"normal"`, `"italic"`) it loads every style, and without `weights` or `subsets` every weight and subset. |
| `loadVariableFont(style, { subsets })` | Loads the variable font faces of a style; throws for a family that has no variable version. |
| `fontFamily` | The CSS font family name. |
| `getInfo()` | Static information about the font: files per style, weight and subset. |

The package root exports `getAvailableFonts()`: every family, with its `fontFamily`, `importName` and a `load()` that imports its module lazily.

The files are downloaded from Google's servers when the page loads, so rendering needs a network connection, and a font that cannot be downloaded fails the render with `E_FONT_LOAD`. Name only the weights and subsets you use: each one is a separate request. For offline or reproducible builds, download the files into `public/` and use `@motiojs/fonts`.

## Compatibility

The compat alias maps `@remotion/google-fonts` here. The families are the 1,848 that `@remotion/google-fonts` 4.0.545 lists, so import paths match one for one; on the recorded samples the modules reference the same font files, unicode ranges and variable faces.

Documentation: [motio.esse.dev/reference/packages/google-fonts](https://motio.esse.dev/reference/packages/google-fonts/) · Guide: [Fonts and text](https://motio.esse.dev/guide/fonts-and-text/#google-fonts) · Source: [packages/google-fonts](https://github.com/essedev/motio/tree/main/packages/google-fonts)
