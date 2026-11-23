// CSS transform strings as interpolate() outputs: parsing into numeric
// components, normalising a whole output range to one shape, and formatting
// interpolated components back into a string. The rules (accepted forms,
// defaults, units, which inputs fail) follow remotion.dev/docs/interpolate and were
// completed black-box against the oracle recordings (COMPAT.md).

/** The `outputType` values of `interpolate()`. */
export type InterpolateOutputType =
	| "font-weight"
	| "scale"
	| "translate"
	| "rotate"
	| "transform-origin";

/** The kind of CSS value a string output parses as. */
export type CssValueKind = "scale" | "translate" | "rotate" | "transform-origin";

type Component = { value: number; unit: string };

type ParsedValue = {
	kind: CssValueKind;
	/** The value as written (or the number, as a string). */
	raw: string;
	components: Component[];
	/** Rotation axis, for `rotate` values written with one (`x 90deg`, `1 0 0 90deg`). */
	axis?: [number, number, number] | undefined;
};

/** A normalised output range: one numeric vector per keyframe and a formatter. */
export type CssPlan = {
	/** Vectors at the start and end of a segment (an axis can depend on the segment). */
	segment(index: number): { from: readonly number[]; to: readonly number[] };
	/** Vector of one keyframe on its own (for a single-keyframe range). */
	keyframe(index: number): readonly number[];
	/** Number of components of every vector. */
	dimension: number;
	format(components: readonly number[]): string;
};

const NUMBER_TOKEN = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)$/;
const ORIGIN_KEYWORD = /^(?:left|right|top|bottom|center)$/i;
const AXIS_KEYWORD = /^[xyz]$/i;

const ANGLE_UNITS = new Set(["deg", "rad", "grad", "turn"]);
// CSS lengths (lowercase, as Remotion only accepts them) and percentages.
const LENGTH_UNITS = new Set([
	"px",
	"cm",
	"mm",
	"q",
	"in",
	"pc",
	"pt",
	"em",
	"rem",
	"ex",
	"rex",
	"cap",
	"rcap",
	"ch",
	"rch",
	"ic",
	"ric",
	"lh",
	"rlh",
	"vw",
	"vh",
	"vi",
	"vb",
	"vmin",
	"vmax",
	"svw",
	"svh",
	"svi",
	"svb",
	"svmin",
	"svmax",
	"lvw",
	"lvh",
	"lvi",
	"lvb",
	"lvmin",
	"lvmax",
	"dvw",
	"dvh",
	"dvi",
	"dvb",
	"dvmin",
	"dvmax",
	"cqw",
	"cqh",
	"cqi",
	"cqb",
	"cqmin",
	"cqmax",
]);

const tokensOf = (value: string): string[] => value.split(/\s+/).filter((t) => t !== "");

const isAngleToken = (token: string): boolean => {
	const match = NUMBER_TOKEN.exec(token);
	return match !== null && ANGLE_UNITS.has(match[2] as string);
};

/**
 * Whether a string output is meant as a CSS transform value, so that it is
 * parsed strictly (and errors explain what is wrong with it), rather than
 * treated as a discrete string such as a cursor name or a colour.
 */
export const looksLikeCssValue = (value: string, outputType: InterpolateOutputType | undefined) => {
	if (outputType === "transform-origin") return true;
	const tokens = tokensOf(value);
	if (tokens.some((t) => ORIGIN_KEYWORD.test(t))) return true;
	if (
		tokens.length === 2 &&
		AXIS_KEYWORD.test(tokens[0] as string) &&
		isAngleToken(tokens[1] as string)
	) {
		return true;
	}
	return tokens.length > 0 && tokens.every((t) => NUMBER_TOKEN.test(t));
};

const componentCountError = (raw: string) =>
	new TypeError(
		`"${raw}" in outputRange has the wrong number of components: use 1 to 3, separated by spaces.`,
	);

const AXES: Record<string, [number, number, number]> = {
	x: [1, 0, 0],
	y: [0, 1, 0],
	z: [0, 0, 1],
};

const kindOfUnit = (raw: string, unit: string): CssValueKind => {
	if (unit === "") return "scale";
	if (LENGTH_UNITS.has(unit) || unit === "%") return "translate";
	if (ANGLE_UNITS.has(unit)) return "rotate";
	throw new TypeError(
		`"${raw}" uses the unit "${unit}", which is neither a length nor an angle: use a unit such as px, %, em or deg.`,
	);
};

const parseNumberToken = (token: string): Component => {
	const match = NUMBER_TOKEN.exec(token) as RegExpExecArray;
	return { value: Number(match[1]), unit: match[2] as string };
};

/** Parses a scale, translate or rotate string. */
const parseTransformValue = (raw: string): ParsedValue => {
	const tokens = tokensOf(raw);
	if (tokens.length === 2 && AXIS_KEYWORD.test(tokens[0] as string)) {
		return {
			kind: "rotate",
			raw,
			axis: AXES[(tokens[0] as string).toLowerCase()],
			components: [parseNumberToken(tokens[1] as string)],
		};
	}
	if (tokens.length === 4) {
		const parts = tokens.map(parseNumberToken);
		const [a, b, c, angle] = parts as [Component, Component, Component, Component];
		if (a.unit === "" && b.unit === "" && c.unit === "" && ANGLE_UNITS.has(angle.unit)) {
			return { kind: "rotate", raw, axis: [a.value, b.value, c.value], components: [angle] };
		}
	}
	if (tokens.length > 3) throw componentCountError(raw);
	const components = tokens.map(parseNumberToken);
	const kinds = components.map((c) => kindOfUnit(raw, c.unit));
	const first = kinds[0] as CssValueKind;
	const other = kinds.find((k) => k !== first);
	if (other !== undefined) {
		throw new TypeError(
			`"${raw}" combines ${first} and ${other} components: one value must be only one of them.`,
		);
	}
	return { kind: first, raw, components };
};

const HORIZONTAL: Record<string, number> = { left: 0, right: 100 };
const VERTICAL: Record<string, number> = { top: 0, bottom: 100 };

const percent = (value: number): Component => ({ value, unit: "%" });
const CENTER = percent(50);

/** Parses a `transform-origin` value: keywords, length-percentages and an optional z length. */
const parseOriginValue = (raw: string): ParsedValue => {
	const tokens = tokensOf(raw);
	if (tokens.length < 1 || tokens.length > 3) throw componentCountError(raw);
	type Token = { keyword: string } | { length: Component };
	const read = (token: string): Token => {
		if (ORIGIN_KEYWORD.test(token)) return { keyword: token.toLowerCase() };
		const match = NUMBER_TOKEN.exec(token);
		if (match !== null && (LENGTH_UNITS.has(match[2] as string) || match[2] === "%")) {
			return { length: parseNumberToken(token) };
		}
		throw new TypeError(
			`"${raw}": "${token}" is neither a transform-origin keyword nor a length-percentage.`,
		);
	};
	const first = read(tokens[0] as string);
	let x: Component;
	let y: Component;
	if (tokens.length === 1) {
		if ("length" in first) {
			x = first.length;
			y = CENTER;
		} else if (first.keyword in VERTICAL) {
			x = CENTER;
			y = percent(VERTICAL[first.keyword] as number);
		} else {
			x = first.keyword === "center" ? CENTER : percent(HORIZONTAL[first.keyword] as number);
			y = CENTER;
		}
	} else {
		const second = read(tokens[1] as string);
		const pairError = () =>
			new TypeError(
				`"${raw}": "${tokens[0]} ${tokens[1]}" is not a valid pair of transform-origin keywords.`,
			);
		const horizontal = (k: string) => (k === "center" ? CENTER : percent(HORIZONTAL[k] as number));
		const vertical = (k: string) => (k === "center" ? CENTER : percent(VERTICAL[k] as number));
		if ("keyword" in first && "keyword" in second) {
			const a = first.keyword;
			const b = second.keyword;
			if (a in HORIZONTAL) {
				if (!(b in VERTICAL) && b !== "center") throw pairError();
				x = horizontal(a);
				y = vertical(b);
			} else if (a in VERTICAL) {
				if (!(b in HORIZONTAL) && b !== "center") throw pairError();
				x = horizontal(b);
				y = vertical(a);
			} else if (b in HORIZONTAL) {
				x = horizontal(b);
				y = CENTER;
			} else {
				x = CENTER;
				y = vertical(b);
			}
		} else if ("keyword" in first && "length" in second) {
			if (first.keyword in VERTICAL) {
				x = second.length;
				y = vertical(first.keyword);
			} else {
				x = horizontal(first.keyword);
				y = second.length;
			}
		} else if ("length" in first && "keyword" in second) {
			if (second.keyword in HORIZONTAL) {
				throw new TypeError(
					`"${raw}": a horizontal transform-origin keyword must come before the length-percentage, not after it.`,
				);
			}
			x = first.length;
			y = vertical(second.keyword);
		} else {
			x = (first as { length: Component }).length;
			y = (second as { length: Component }).length;
		}
	}
	const components = [x, y];
	if (tokens.length === 3) {
		const token = tokens[2] as string;
		const match = NUMBER_TOKEN.exec(token);
		if (match === null || !LENGTH_UNITS.has(match[2] as string)) {
			throw new TypeError(
				`"${raw}": the transform-origin z offset "${token}" must be a length, such as 10px.`,
			);
		}
		components.push(parseNumberToken(token));
	}
	return { kind: "transform-origin", raw, components };
};

/** Formats an interpolated number: rounded to 6 decimals, no trailing zeros, never "-0". */
export const formatCssNumber = (value: number): string => String(Math.round(value * 1e6) / 1e6);

const familyOf = (kind: CssValueKind) => (kind === "transform-origin" ? "translate" : kind);

/** Unit of every axis, checked to be the same on every keyframe that has the axis. */
const axisUnits = (values: readonly ParsedValue[], count: number): string[] => {
	const units: string[] = [];
	for (let axis = 0; axis < count; axis++) {
		let unit: string | undefined;
		for (const value of values) {
			const component = value.components[axis];
			if (component === undefined) continue;
			if (unit === undefined) unit = component.unit;
			else if (component.unit !== unit) {
				throw new TypeError(
					`The ${familyOf(values[0]?.kind ?? "translate")} keyframes use ${unit} and ${component.unit} on axis ${axis + 1}: use the same unit on that axis in every keyframe.`,
				);
			}
		}
		units.push(unit ?? "");
	}
	return units;
};

const staticPlan = (vectors: number[][], format: (c: readonly number[]) => string): CssPlan => ({
	segment: (index) => ({
		from: vectors[index] as number[],
		to: vectors[index + 1] as number[],
	}),
	keyframe: (index) => vectors[index] as number[],
	dimension: vectors[0]?.length ?? 0,
	format,
});

/** Value of a missing component: scale y copies x, as in CSS; the rest use the kind's default. */
type MissingValue = (value: ParsedValue, axis: number) => number;

const listPlan = (values: readonly ParsedValue[], missing: MissingValue, minCount = 1): CssPlan => {
	const count = Math.max(minCount, ...values.map((v) => v.components.length));
	const units = axisUnits(values, count);
	const vectors = values.map((v) =>
		Array.from({ length: count }, (_, i) => v.components[i]?.value ?? missing(v, i)),
	);
	return staticPlan(vectors, (c) => c.map((n, i) => `${formatCssNumber(n)}${units[i]}`).join(" "));
};

const isZeroPlainAngle = (value: ParsedValue) =>
	value.axis === undefined && value.components[0]?.value === 0;

const rotatePlan = (values: readonly ParsedValue[]): CssPlan => {
	if (!values.some((v) => v.axis !== undefined)) return listPlan(values, () => 0);
	if (values.some((v) => v.components.length > 1)) {
		throw new TypeError(
			"The rotate keyframes mix several angles with a rotation about an axis: use one form in every keyframe.",
		);
	}
	const [unit] = axisUnits(values, 1);
	// A rotation by 0 without an axis is the same about any axis, so it takes an
	// axis from its neighbours; any other rotation without an axis turns about z.
	// Identified black-box (COMPAT.md): at the start of a segment it takes the first
	// explicit axis after it; at the end of a segment it takes the first explicit
	// axis before it, looking past rotations about z but not past another
	// rotation by 0. Without one, z.
	const isExplicit = (i: number) => values[i]?.axis !== undefined;
	const axisForward = (from: number): readonly number[] => {
		for (let i = from; i < values.length; i++)
			if (isExplicit(i)) return values[i]?.axis as number[];
		return AXES.z as number[];
	};
	const axisBackward = (from: number): readonly number[] => {
		for (let i = from; i >= 0; i--) {
			const value = values[i] as ParsedValue;
			if (value.axis !== undefined) return value.axis;
			if (isZeroPlainAngle(value)) break;
		}
		return AXES.z as number[];
	};
	const vectorAt = (index: number, end: "start" | "end"): number[] => {
		const value = values[index] as ParsedValue;
		const angle = value.components[0]?.value ?? 0;
		const axis =
			value.axis ??
			(!isZeroPlainAngle(value)
				? (AXES.z as number[])
				: end === "start"
					? axisForward(index + 1)
					: axisBackward(index - 1));
		return [...axis, angle];
	};
	return {
		segment: (index) => ({ from: vectorAt(index, "start"), to: vectorAt(index + 1, "end") }),
		keyframe: (index) => vectorAt(index, "start"),
		dimension: 4,
		format: (c) =>
			`${formatCssNumber(c[0] as number)} ${formatCssNumber(c[1] as number)} ${formatCssNumber(c[2] as number)} ${formatCssNumber(c[3] as number)}${unit}`,
	};
};

/**
 * Parses and normalises an output range of CSS transform strings (numbers
 * count as scale values). Every keyframe must be of one kind; missing
 * components take the kind's default (scale 1, translate and rotate 0,
 * transform-origin 50% 50% 0) and every axis keeps one unit.
 */
export const planCssOutput = (
	outputRange: readonly (string | number)[],
	outputType: Exclude<InterpolateOutputType, "font-weight"> | undefined,
): CssPlan => {
	const parsed = outputRange.map((value): ParsedValue => {
		if (typeof value === "number") {
			return { kind: "scale", raw: String(value), components: [{ value, unit: "" }] };
		}
		const tokens = tokensOf(value);
		return outputType === "transform-origin" || tokens.some((t) => ORIGIN_KEYWORD.test(t))
			? parseOriginValue(value)
			: parseTransformValue(value);
	});
	const first = familyOf((parsed[0] as ParsedValue).kind);
	for (const value of parsed) {
		const family = familyOf(value.kind);
		if (family !== first) {
			throw new TypeError(
				`outputRange mixes ${first} and ${family} keyframes: use one kind of value in every keyframe.`,
			);
		}
	}
	if (outputType !== undefined) {
		for (const value of parsed) {
			if (value.kind !== outputType) {
				throw new TypeError(
					`"${value.raw}" is a ${value.kind} value, but outputType is "${outputType}".`,
				);
			}
		}
	}
	const kind = (parsed[0] as ParsedValue).kind;
	if (kind === "rotate") return rotatePlan(parsed);
	if (kind === "scale") {
		return listPlan(parsed, (v, axis) => (axis === 1 ? (v.components[0]?.value ?? 1) : 1));
	}
	// Translate and transform-origin: a translate value next to an origin keeps
	// the translate defaults (0) for its missing components.
	return listPlan(parsed, () => 0);
};
