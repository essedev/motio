# @motiojs/layout-utils

Measure and fit text in the browser, for layouts that depend on the size of a string in a [Motio](https://motio.esse.dev) video. Every function measures a real element with the fonts the page has loaded, so load the font first, or the sizes are those of a fallback font.

```bash
pnpm add @motiojs/layout-utils
```

<!-- example: ../../docs/guide/examples/src/packages/layout-utils.tsx#fit -->
```tsx
import { fitText } from "@motiojs/layout-utils";
import { AbsoluteFill } from "@motiojs/motio";

export const Headline = ({ text }: { text: string }) => {
	// The font size at which the text is exactly 1000 px wide, measured with the loaded font.
	const { fontSize } = fitText({ text, withinWidth: 1000, fontFamily: "Inter", fontWeight: "700" });
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<h1 style={{ fontFamily: "Inter", fontWeight: 700, fontSize, whiteSpace: "nowrap" }}>
				{text}
			</h1>
		</AbsoluteFill>
	);
};
```

| Export | What it does |
|---|---|
| `measureText(style)` | Width and height of `text` rendered with the given font and CSS properties. Results are cached per argument set; `validateFontIsLoaded: true` throws when the font is not loaded. |
| `fitText(options)` | The font size in pixels at which `text` is exactly `withinWidth` wide. |
| `fitTextOnNLines(options)` | The largest font size (to 0.01 px) at which `text`, wrapped on spaces, fits in `maxLines` lines of `maxBoxWidth`, and the resulting lines. |
| `fillTextBox({ maxBoxWidth, maxLines })` | A box filled word by word: each `add(style)` reports whether the text starts a new line or would overflow the box (overflowing text is not added). |

`@motiojs/text` uses `measureText()` to draw backgrounds behind measured lines: see [Fonts and text](https://motio.esse.dev/guide/fonts-and-text/#text-backgrounds).

## Compatibility

The compat alias maps `@remotion/layout-utils` here. The functions are compared with recordings of the published package in the same browser.

Documentation: [motio.esse.dev/reference/packages/layout-utils](https://motio.esse.dev/reference/packages/layout-utils/) · Guide: [Fonts and text](https://motio.esse.dev/guide/fonts-and-text/) · Source: [packages/layout-utils](https://github.com/essedev/motio/tree/main/packages/layout-utils)
