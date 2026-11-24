# @motiojs/zod-types

[Zod](https://zod.dev) schemas for values that video props often hold: colours, multi-line text and matrices. Use them in the `schema` of a [Motio](../../README.md) composition, which the preview checks its props editor against (see [Compositions](../../docs/guide/compositions.md#schema)).

```bash
pnpm add @motiojs/zod-types zod
```

Zod 4 is a peer dependency: the schemas are built with the copy of Zod your project installs.

<!-- example: ../../docs/guide/examples/src/packages/zod-types.tsx#schema -->
```tsx
import { isValidColor, zColor, zMatrix, zTextarea } from "@motiojs/zod-types";
import { z } from "zod";

export const lowerThirdSchema = z.object({
	// Any CSS colour a browser draws: "#ffb000", "tomato", "rgb(255, 176, 0)", "oklch(0.8 0.17 75)".
	background: zColor(),
	// A string whose line breaks are part of the value.
	text: zTextarea(),
	// A square matrix as a flat array: 1, 4, 9, 16, ... numbers (here a 3x3 colour matrix).
	colorMatrix: zMatrix(),
});

lowerThirdSchema.parse({
	background: "tomato",
	text: "Ada Lovelace\nMathematician",
	colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
});

// The same check outside a schema.
isValidColor("#ffb00080"); // true
isValidColor("Tomato"); // false: named colours are lower case
```

| Export | Accepts |
|---|---|
| `zColor()` | A string the browser draws as a colour: hex with 3, 4, 6 or 8 digits, a lower-case CSS named colour or `transparent`, `rgb()`, `rgba()`, `hsl()` and `hsla()` with commas, and `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` with spaces and an optional `/ alpha`. Anything else fails with "Invalid color". |
| `zTextarea()` | Any string; marks a value whose line breaks are part of the text. |
| `zMatrix()` | A non-empty array of numbers whose length is a square (1, 4, 9, 16, ...); fails with "The matrix must be square". |
| `isValidColor(value)` | The check behind `zColor()`, as a function returning a boolean. |

The preview's props editor is a JSON editor: these schemas validate what you type there and in `--props`, they do not add a colour picker or a text area.

## Compatibility

The compat alias maps `@remotion/zod-types` here; `zColor()` accepts and rejects the same inputs as the published package, checked against its recordings.
