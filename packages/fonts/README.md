# @motiojs/fonts

Load a font file and hold the render until it is ready, so no frame of a [Motio](https://motio.esse.dev) video is captured with a fallback font.

```bash
pnpm add @motiojs/fonts
```

<!-- example: ../../docs/guide/examples/src/fonts-local.tsx -->
```tsx
import { loadFont } from "@motiojs/fonts";
import { staticFile } from "@motiojs/motio";

// public/fonts/brand.woff2. The render waits until the file has loaded; a missing file fails it.
loadFont({ family: "Brand", url: staticFile("fonts/brand.woff2"), weight: 700 });

export const Title = () => <h1 style={{ fontFamily: "Brand", fontWeight: 700 }}>Hello</h1>;
```

`loadFont(options)` registers the file under `family` and returns a promise. Call it at module level in a file the root imports, once per weight and style. It accepts the `@font-face` descriptors (`weight`, `style`, `stretch`, `unicodeRange`, `display`, `featureSettings`, `ascentOverride`, `descentOverride`, `lineGapOverride`) and `format` (`woff2`, `woff`, `opentype`, `truetype`), needed only when the URL's extension does not tell it. A file that fails to load (a 404, a file the browser cannot decode) fails the render with `E_FONT_LOAD` and rejects the promise.

For Google Fonts, `@motiojs/google-fonts` has one typed module per family.

## Compatibility

The compat alias maps `@remotion/fonts` here.

Documentation: [motio.esse.dev/reference/packages/fonts](https://motio.esse.dev/reference/packages/fonts/) · Guide: [Fonts and text](https://motio.esse.dev/guide/fonts-and-text/#a-font-file) · Source: [packages/fonts](https://github.com/essedev/motio/tree/main/packages/fonts)
