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

A CSS `background` on wrapped text gives one separate box per line. `<TextBackground>` from `@motiojs/text` draws a single shape that follows every line: it sticks out where a line is longer than its neighbour and turns inward, with a concave corner, where a line is shorter. It suits captions and titles that wrap:

<!-- example: examples/src/text-background.tsx#component -->
```tsx
export const Caption = ({ text }: { text: string }) => {
	const frame = useCurrentFrame();
	// The text appears word by word; the background follows the lines as they grow.
	const words = text.split(" ");
	const shown = Math.min(words.length, Math.floor(frame / 4) + 1);
	return (
		<AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
			<TextBackground
				align="center"
				cornerRadius={16}
				paddingX={24}
				paddingY={8}
				join="round"
				fill="#ffb000"
				border={{ width: 4, color: "#101820" }}
				shadow={{ offsetY: 8, blur: 20, color: "rgba(0, 0, 0, 0.4)" }}
				style={{
					maxWidth: 1000,
					fontFamily: "Inter",
					fontSize: 64,
					fontWeight: 700,
					lineHeight: 1.25,
					color: "#101820",
					opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
				}}
			>
				{words.slice(0, shown).join(" ")}
			</TextBackground>
		</AbsoluteFill>
	);
};
```

The browser lays out the text (wrapping at `maxWidth`, fonts, `<br />`), and the component measures each line and draws the shape as an SVG behind it. It measures again whenever it renders and when a font finishes loading, so the shape follows text that changes from frame to frame. A render waits until the lines have been measured with their fonts loaded. The Player's scale and transforms of the parents, rotations included, do not change the measurement.

| Prop | Default | |
|---|---|---|
| `align` | `"left"` | `"left"`, `"center"` or `"right"`; also sets `text-align`. |
| `cornerRadius` | `0` | Radius of every corner. A corner never takes more than half its line's height, half the step to the neighbouring line on its side, or half the width of the first or last line. |
| `paddingX` | `0` | Space left and right of every line. |
| `paddingY` | `0` | Space above the first line and below the last. |
| `join` | `"round"` | Corners as `"round"` arcs, `"bevel"` straight cuts or `"sharp"` square corners. |
| `fill` | `"white"` | Colour of the shape. |
| `border` | none | `{ width, color }`, centred on the outline. |
| `shadow` | none | `{ offsetX, offsetY, blur, color }`, a drop shadow of the whole shape. |
| `style`, `className` | | On the block, an `inline-block`. |

Children should be inline: text, `<span>`, `<b>`, `<br />`. Block elements inside are not measured.

`makeTextBackground()` is the same shape as a pure function of the line sizes, for an SVG of your own, a canvas or code in Node. It returns the path, its `width` and `height`, the path as `instructions` for `@motiojs/paths`, and where each line's text goes:

<!-- example: examples/src/text-background.tsx#shape -->
```tsx
export const Badge = () => {
	const fontSize = 48;
	const lineHeight = fontSize * 1.3;
	const texts = ["New", "this week"];
	// One entry per line: the width of its text and the height of its line box.
	const shape = makeTextBackground({
		lines: texts.map((text) => ({
			width: measureText({ text, fontFamily: "Inter", fontSize, fontWeight: "700" }).width,
			height: lineHeight,
		})),
		align: "left",
		cornerRadius: 12,
		paddingX: 18,
		paddingY: 6,
		join: "bevel",
	});
	return (
		<svg width={shape.width} height={shape.height} role="img" aria-label={texts.join(" ")}>
			<path d={shape.path} fill="#101820" />
			{shape.lines.map((line, i) => (
				<text
					key={texts[i]}
					x={line.x}
					y={line.y + line.height / 2}
					dominantBaseline="central"
					fill="white"
					style={{ fontFamily: "Inter", fontSize, fontWeight: 700 }}
				>
					{texts[i]}
				</text>
			))}
		</svg>
	);
};
```

`measureText()` measures with the fonts the page has loaded, so load the font first (see above) or the widths are those of a fallback font. Negative sizes and unknown `align` or `join` values throw a `TypeError`.

Projects that use `@remotion/rounded-text-box` keep working: the compatibility layer maps it to `@motiojs/text/rounded-text-box`, a preset of the same shape that returns the same values as the published package.
