# @motiojs/text

Text helpers for [Motio](../../README.md) videos.

## TextBackground

`<TextBackground>` draws a background shape that follows the lines of a block of text: one box per line, merged into a single outline. Where a line sticks out the corner is convex; where a line is shorter than its neighbour the outline turns inward with a concave corner. CSS backgrounds cannot draw this shape (a `background` on an inline element gives separate boxes per line, with no inner corners).

```tsx
import { AbsoluteFill } from "motio";
import { TextBackground } from "@motiojs/text";

export const Caption = () => (
	<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
		<TextBackground
			align="center"
			cornerRadius={18}
			paddingX={24}
			paddingY={6}
			fill="white"
			border={{ width: 3, color: "black" }}
			shadow={{ offsetY: 6, blur: 16, color: "rgba(0, 0, 0, 0.35)" }}
			style={{ maxWidth: 900, fontFamily: "Inter", fontSize: 64, lineHeight: 1.3, color: "black" }}
		>
			Corners follow every line, even the short ones
		</TextBackground>
	</AbsoluteFill>
);
```

The browser lays the text out (wrapping at `maxWidth`, fonts, `<br />`); the component measures every line and draws the shape behind it as an SVG. It measures again on every render and when a font finishes loading. In a render, the frame waits (through `delayRender()`) until the lines have been measured with every font loaded. The measurement does not depend on the Player's scale or on transforms of ancestors, rotations included.

| Prop | Default | |
|---|---|---|
| `align` | `"left"` | `"left"`, `"center"` or `"right"`; also sets `text-align`. |
| `cornerRadius` | `0` | Size of every corner. A corner never takes more than half its line's height, half the step to the neighbouring line on its side, or half the width of the first or last line. |
| `paddingX` | `0` | Space left and right of every line. |
| `paddingY` | `0` | Space above the first line and below the last. |
| `join` | `"round"` | `"round"` arcs, `"bevel"` straight cuts, `"sharp"` square corners. |
| `fill` | `"white"` | Colour of the shape. |
| `border` | none | `{ width, color }`, drawn centred on the outline with a matching line join. |
| `shadow` | none | `{ offsetX, offsetY, blur, color }`, a CSS `drop-shadow()` of the whole shape. |
| `style`, `className` | | The block is an `inline-block`; its `padding` and `text-align` come from the props above. |
| `delayRenderTimeoutInMilliseconds` | 30 s | Timeout of the readiness handle. |

Children should be inline content: text, `<span>`, `<b>`, `<br />`. Block elements inside are not measured.

### makeTextBackground()

The shape as a pure function of line measurements, for SVG you build yourself, canvas drawing or Node:

```ts
import { measureText } from "@motiojs/layout-utils";
import { makeTextBackground } from "@motiojs/text";

const font = { fontFamily: "Inter", fontSize: 64, fontWeight: "700" };
const lines = ["Hello", "from Motio"].map((text) => ({
	width: measureText({ text, ...font }).width,
	height: 64 * 1.3,
}));
const { path, width, height, lines: boxes } = makeTextBackground({
	lines,
	align: "center",
	cornerRadius: 16,
	paddingX: 20,
	paddingY: 8,
	join: "round",
});
// <svg width={width} height={height}><path d={path} /></svg>, each line's text at boxes[i].x, boxes[i].y
```

It returns the SVG `path` (from (0, 0) to (`width`, `height`)), the same path as `instructions` (`M`, `L`, `C`, `Z`, usable with `@motiojs/paths`), the shape's `width` and `height`, and `lines`: where each line's text goes so the shape surrounds it. Negative or non-finite sizes and unknown `align` or `join` values throw a `TypeError`.

## The @remotion/rounded-text-box preset

`@motiojs/text/rounded-text-box` exports `createRoundedTextBox()` with the API of `@remotion/rounded-text-box`, and the compat alias maps `@remotion/rounded-text-box` to it, so Remotion projects that use it build unchanged.

```ts
import { createRoundedTextBox } from "@motiojs/text/rounded-text-box";

const { d, boundingBox, instructions } = createRoundedTextBox({
	textMeasurements: [{ width: 300, height: 54 }, { width: 180, height: 54 }],
	textAlign: "center",
	horizontalPadding: 20,
	borderRadius: 20,
});
```

It is `makeTextBackground()` with round joins and no vertical padding, laid out with the published package's own arithmetic: on 1009 recorded inputs it returns the same `d` string, `boundingBox` and `instructions` as `@remotion/rounded-text-box@4.0.545`. Two of those rules differ from `makeTextBackground()`: an alignment other than `"center"` or `"right"` lays the lines out from the left but rounds both sides, and a corner is not capped by its line's width (an empty line draws a corner outside the box). Inputs with a negative line height are outside the function's domain and give a different path.
