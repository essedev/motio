// The schema helpers of Interactive: plain data describing which props the
// Remotion Studio can edit. Rendering never reads them; they are exported so
// that compositions spreading them (`...Interactive.textSchema`) build, with
// the values Remotion 4.0.545 publishes (recorded in __oracle__/interactive.json).

/** One editable prop of an interactivity schema. */
export type InteractivitySchemaField = {
	/** Kind of control: "number", "string", "boolean", "color", "enum", "hidden", ... */
	type: string;
	/** Value used when the prop is not set. */
	default?: unknown;
	/** Label of the control. */
	description?: string;
	min?: number;
	max?: number;
	step?: number;
	/** Whether the control is left out of the Studio's list. */
	hiddenFromList?: boolean;
	/** Whether the prop can be animated with keyframes. */
	keyframable?: boolean;
	/** For "enum" fields: the variants, each with the fields it adds. */
	variants?: Record<string, InteractivitySchema>;
	/** For scale fields: the `output` used when keyframes are added. */
	defaultKeyframeOutput?: string;
};

/**
 * Describes the props of a component that the Remotion Studio can edit, keyed
 * by prop name (`style.color` for a style property). Used by
 * `Interactive.withSchema()` and `Interactive.create()`; it has no effect on
 * rendering.
 */
export type InteractivitySchema = Record<string, InteractivitySchemaField>;

/** Studio controls for the timing props: durationInFrames, from, trimBefore, playbackRate, freeze, hidden, name, showInTimeline. */
export const baseSchema = {
	durationInFrames: {
		type: "number",
		default: undefined,
		min: 1,
		step: 1,
		hiddenFromList: true,
	},
	from: {
		type: "number",
		default: 0,
		step: 1,
		hiddenFromList: true,
	},
	trimBefore: {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		hiddenFromList: true,
	},
	playbackRate: {
		type: "number",
		default: 1,
		min: 0.01,
		step: 0.1,
		description: "Playback rate",
		hiddenFromList: false,
		keyframable: false,
	},
	freeze: {
		type: "number",
		default: null,
		step: 1,
		hiddenFromList: true,
	},
	hidden: {
		type: "boolean",
		default: false,
		description: "Hidden",
	},
	name: {
		type: "hidden",
	},
	showInTimeline: {
		type: "hidden",
	},
} as const satisfies InteractivitySchema;

/** Studio controls for premountFor and postmountFor. */
export const premountSchema = {
	premountFor: {
		type: "number",
		default: undefined,
		description: "Premount For",
		min: 0,
		step: 1,
		hiddenFromList: false,
		keyframable: false,
	},
	postmountFor: {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		hiddenFromList: true,
		keyframable: false,
	},
} as const satisfies InteractivitySchema;

/** Studio controls for style.transformOrigin, translate, scale, rotate and opacity. */
export const transformSchema = {
	"style.transformOrigin": {
		type: "transform-origin",
		step: 1,
		default: "50% 50%",
		description: "Origin",
	},
	"style.translate": {
		type: "translate",
		step: 1,
		default: "0px 0px",
		description: "Offset",
	},
	"style.scale": {
		type: "scale",
		max: 100,
		step: 0.01,
		default: 1,
		description: "Scale",
		defaultKeyframeOutput: "perceptual-scale",
	},
	"style.rotate": {
		type: "rotation-css",
		step: 1,
		default: "0deg",
		description: "Rotation",
	},
	"style.opacity": {
		type: "number",
		min: 0,
		max: 1,
		step: 0.01,
		default: 1,
		description: "Opacity",
		hiddenFromList: false,
	},
} as const satisfies InteractivitySchema;

/** Studio controls for cropLeft, cropRight, cropTop and cropBottom. */
export const cropSchema = {
	cropLeft: {
		type: "number",
		default: 0,
		description: "Crop left",
		min: 0,
		max: 1,
		step: 0.01,
		hiddenFromList: false,
		keyframable: true,
	},
	cropRight: {
		type: "number",
		default: 0,
		description: "Crop right",
		min: 0,
		max: 1,
		step: 0.01,
		hiddenFromList: false,
		keyframable: true,
	},
	cropTop: {
		type: "number",
		default: 0,
		description: "Crop top",
		min: 0,
		max: 1,
		step: 0.01,
		hiddenFromList: false,
		keyframable: true,
	},
	cropBottom: {
		type: "number",
		default: 0,
		description: "Crop bottom",
		min: 0,
		max: 1,
		step: 0.01,
		hiddenFromList: false,
		keyframable: true,
	},
} as const satisfies InteractivitySchema;

/** Studio controls for text: color, font family, size, line height, weight, style, alignment and letter spacing. */
export const textSchema = {
	"style.color": {
		type: "color",
		default: undefined,
		description: "Color",
	},
	"style.fontFamily": {
		type: "font-family",
		default: undefined,
		description: "Font family",
		keyframable: false,
	},
	"style.fontSize": {
		type: "number",
		default: undefined,
		min: 0,
		step: 1,
		description: "Font size",
		hiddenFromList: false,
	},
	"style.lineHeight": {
		type: "number",
		default: undefined,
		min: 0,
		step: 0.05,
		description: "Line height",
		hiddenFromList: false,
	},
	"style.fontWeight": {
		type: "font-weight",
		default: 400,
		description: "Font weight",
	},
	"style.fontStyle": {
		type: "enum",
		default: "normal",
		description: "Font style",
		variants: {
			normal: {},
			italic: {},
			oblique: {},
		},
	},
	"style.textAlign": {
		type: "enum",
		default: "left",
		description: "Text align",
		variants: {
			left: {},
			center: {},
			right: {},
			justify: {},
			start: {},
			end: {},
		},
	},
	"style.letterSpacing": {
		type: "number",
		default: undefined,
		step: 0.1,
		description: "Letter spacing",
		hiddenFromList: false,
	},
} as const satisfies InteractivitySchema;

/** Studio control for string children. */
export const childrenSchema = {
	children: {
		type: "string",
		default: "",
		description: "Text",
		keyframable: false,
	},
} as const satisfies InteractivitySchema;

/** Studio control for a `captions` prop holding `Caption[]` data. */
export const captionsSchema = {
	captions: {
		type: "remotion-captions",
		default: undefined,
		description: "Captions",
		keyframable: false,
	},
} as const satisfies InteractivitySchema;

/** Studio control for style.backgroundColor. */
export const backgroundSchema = {
	"style.backgroundColor": {
		type: "color",
		default: "transparent",
		description: "Color",
	},
} as const satisfies InteractivitySchema;

/** Studio controls for the border width, style and color longhands. */
export const borderSchema = {
	"style.borderWidth": {
		type: "number",
		default: undefined,
		min: 0,
		step: 1,
		description: "Border width",
		hiddenFromList: false,
	},
	"style.borderStyle": {
		type: "enum",
		default: "none",
		description: "Border style",
		variants: {
			none: {},
			hidden: {},
			solid: {},
			dashed: {},
			dotted: {},
			double: {},
			groove: {},
			ridge: {},
			inset: {},
			outset: {},
		},
	},
	"style.borderColor": {
		type: "color",
		default: undefined,
		description: "Border color",
	},
} as const satisfies InteractivitySchema;

/** Studio controls for the border radius and its four corners. */
export const borderRadiusSchema = {
	"style.borderRadius": {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		description: "Border radius",
		hiddenFromList: false,
		keyframable: true,
	},
	"style.borderTopLeftRadius": {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		description: "Top left radius",
		hiddenFromList: false,
	},
	"style.borderTopRightRadius": {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		description: "Top right radius",
		hiddenFromList: false,
	},
	"style.borderBottomRightRadius": {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		description: "Bottom right radius",
		hiddenFromList: false,
	},
	"style.borderBottomLeftRadius": {
		type: "number",
		default: 0,
		min: 0,
		step: 1,
		description: "Bottom left radius",
		hiddenFromList: false,
	},
} as const satisfies InteractivitySchema;

/** Studio controls for SVG fill, color, stroke and strokeWidth. */
export const svgPaintSchema = {
	fill: {
		type: "color",
		default: undefined,
		description: "Fill",
	},
	color: {
		type: "color",
		default: undefined,
		description: "Current color",
	},
	stroke: {
		type: "color",
		default: "none",
		description: "Stroke",
	},
	strokeWidth: {
		type: "number",
		default: 1,
		description: "Stroke width",
		min: 0,
		step: 1,
		hiddenFromList: false,
	},
} as const satisfies InteractivitySchema;

/** Studio controls for SVG color, stroke and strokeWidth. */
export const svgStrokeSchema = {
	color: {
		type: "color",
		default: undefined,
		description: "Current color",
	},
	stroke: {
		type: "color",
		default: "none",
		description: "Stroke",
	},
	strokeWidth: {
		type: "number",
		default: 1,
		description: "Stroke width",
		min: 0,
		step: 1,
		hiddenFromList: false,
	},
} as const satisfies InteractivitySchema;

/** Studio controls of `<Sequence>`: the timing fields and a layout with its own fields. */
export const sequenceSchema = {
	...baseSchema,
	layout: {
		type: "enum",
		default: "absolute-fill",
		description: "Layout",
		variants: {
			"absolute-fill": {
				...cropSchema,
				...transformSchema,
				...backgroundSchema,
				...borderSchema,
				...borderRadiusSchema,
			},
			none: {},
		},
	},
} as const satisfies InteractivitySchema;
