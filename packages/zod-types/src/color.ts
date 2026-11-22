/** CSS named colours accepted by `zColor()`, lower case only (as observed from Remotion). */
const NAMED = new Set(
	(
		"aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown " +
		"burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
		"darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
		"darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
		"deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
		"ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
		"lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
		"lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
		"lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
		"mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen " +
		"mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace " +
		"olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred " +
		"papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue " +
		"saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey " +
		"snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
		"yellowgreen transparent"
	).split(" "),
);

const NUM = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)";
const PCT = `${NUM}%`;
const NUM_OR_PCT = `${NUM}%?`;
const C = "\\s*,\\s*";
const S = "\\s+";
const ALPHA = `(?:\\s*\\/\\s*${NUM_OR_PCT})?`;

/** Legacy comma syntax for rgb and hsl, space syntax with optional alpha for the CSS Color 4 spaces. */
const PATTERNS = [
	/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
	new RegExp(`^rgb\\(\\s*${NUM}${C}${NUM}${C}${NUM}\\s*\\)$`),
	new RegExp(`^rgba\\(\\s*${NUM}${C}${NUM}${C}${NUM}${C}${NUM}\\s*\\)$`),
	new RegExp(`^hsl\\(\\s*${NUM}${C}${PCT}${C}${PCT}\\s*\\)$`),
	new RegExp(`^hsla\\(\\s*${NUM}${C}${PCT}${C}${PCT}${C}${NUM}\\s*\\)$`),
	new RegExp(
		`^(?:hwb|lab|lch|oklab|oklch)\\(\\s*${NUM_OR_PCT}${S}${NUM_OR_PCT}${S}${NUM_OR_PCT}${ALPHA}\\s*\\)$`,
	),
];

/** True when `value` is a colour string `zColor()` accepts. */
export function isValidColor(value: string): boolean {
	return NAMED.has(value) || PATTERNS.some((p) => p.test(value));
}
