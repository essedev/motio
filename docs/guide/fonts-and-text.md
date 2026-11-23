# Fonts and text

Text is rendered by Chrome, so any CSS works: `font-family`, `letter-spacing`, `text-shadow`, line clamping, variable fonts. What matters is that the font has loaded before the frame is captured, or the frame shows a fallback font. Motio waits for `document.fonts.ready` before every screenshot and warns when text fell back to a system font, but a font that starts loading late can still miss a frame. Load fonts through one of the two packages below, which hold the render until the files are ready.

## A font file

`@motiojs/fonts` loads a file, usually from `public/`, and registers it under a family name:

<!-- example: examples/src/fonts-local.tsx -->
```tsx
import { loadFont } from "@motiojs/fonts";
import { staticFile } from "motio";

// public/fonts/brand.woff2. The render waits until the file has loaded; a missing file fails it.
loadFont({ family: "Brand", url: staticFile("fonts/brand.woff2"), weight: 700 });

export const Title = () => <h1 style={{ fontFamily: "Brand", fontWeight: 700 }}>Hello</h1>;
```

Call `loadFont()` at module level in a file the root imports (the `basic` starter does it in `src/fonts.ts`), once per weight and style. It accepts the `@font-face` descriptors (`weight`, `style`, `stretch`, `unicodeRange`, `display`, `featureSettings`) and returns a promise. A file that fails to load fails the render with its URL.

## Google Fonts

`@motiojs/google-fonts` has one module per Google font, with typed weights and subsets:

<!-- example: examples/src/fonts-google.tsx -->
```tsx
import { loadFont } from "@motiojs/google-fonts/Inter";

// Downloads from Google Fonts when the page loads; only the weights and subsets you name.
const { fontFamily } = loadFont("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const Body = () => <p style={{ fontFamily }}>Text in Inter</p>;
```

The files are downloaded from Google's servers when the page loads, so rendering needs a network connection; for offline or reproducible builds, download the files into `public/` and use `@motiojs/fonts`. Name only the weights and subsets you use: each one is a separate request.

## Captions

`@motiojs/captions` parses SRT and WebVTT files (`parseSrt()`, `parseVtt()`), writes SRT (`serializeSrt()`), and groups word-level captions into pages for word-by-word display (`createTikTokStyleCaptions()`). The `captions` starter shows a complete example.

## Text backgrounds

> **Coming in M6: `@motiojs/text` and `<TextBackground>`.** A configurable background behind lines of text, with corner radius, padding, line joins, colour, border and shadow.
