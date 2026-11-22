import { NAMED_COLORS } from "./named-colors.js";

/**
 * A color as four 8-bit channels (0..255 each, alpha included), the precision
 * at which Remotion's `interpolateColors()` works.
 */
export type Rgba8 = readonly [r: number, g: number, b: number, a: number];

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toByte = (unit: number) => Math.round(clamp(unit, 0, 1) * 255);

const invalid = (value: unknown) => new Error(`invalid color string ${String(value)} provided`);

// Legacy comma syntax: rgb(r, g, b), rgba(r, g, b, a), hsl(h, s%, l%), hsla(h, s%, l%, a).
const legacy = (name: string, args: string[]) =>
	new RegExp(String.raw`^${name}\(\s*${args.join(String.raw`\s*,\s*`)}\s*\)$`);
const N = `(${NUMBER})`;
const P = `(${NUMBER})%`;
const RGB = legacy("rgb", [N, N, N]);
const RGBA = legacy("rgba", [N, N, N, N]);
const HSL = legacy("hsl", [N, P, P]);
const HSLA = legacy("hsla", [N, P, P, N]);
const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Modern space syntax: name(c1 c2 c3) or name(c1 c2 c3 / alpha).
const COMPONENT = `(${NUMBER}(?:%|deg|grad|rad|turn)?|none)`;
const MODERN = new RegExp(
	String.raw`^(oklch|oklab|lab|lch|hwb)\(\s*${COMPONENT}\s+${COMPONENT}\s+${COMPONENT}\s*(?:\/\s*${COMPONENT}\s*)?\)$`,
);

const parseHex = (digits: string): Rgba8 => {
	const expanded =
		digits.length <= 4
			? digits
					.split("")
					.map((d) => d + d)
					.join("")
			: digits;
	const withAlpha = expanded.length === 6 ? `${expanded}ff` : expanded;
	const value = Number.parseInt(withAlpha, 16);
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
};

const rgbChannel = (text: string) => Math.round(clamp(Number(text), 0, 255));
const alphaByte = (text: string) => toByte(Number(text));

/** sRGB channels in 0..1 from hue (degrees), saturation and lightness (0..1), per CSS Color 4. */
const hslToRgb = (hue: number, s: number, l: number): [number, number, number] => {
	const h = ((hue % 360) + 360) % 360;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
};

const hwbToRgb = (hue: number, white: number, black: number): [number, number, number] => {
	if (white + black >= 1) {
		const gray = white / (white + black);
		return [gray, gray, gray];
	}
	return hslToRgb(hue, 1, 0.5).map((c) => c * (1 - white - black) + white) as [
		number,
		number,
		number,
	];
};

/** Gamma-encodes a linear-light sRGB channel (sign-preserving, per CSS Color 4). */
const gammaEncode = (linear: number) => {
	const abs = Math.abs(linear);
	const encoded = abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : 12.92 * abs;
	return Math.sign(linear) * encoded;
};

type Vec3 = [number, number, number];
const multiply = (m: readonly Vec3[], v: Vec3): Vec3 =>
	m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as Vec3;

// Matrices from CSS Color Module Level 4 (sample code for conversions).
const OKLAB_TO_LMS: readonly Vec3[] = [
	[1, 0.3963377773761749, 0.2158037573099136],
	[1, -0.1055613458156586, -0.0638541728258133],
	[1, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_XYZ_D65: readonly Vec3[] = [
	[1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
	[-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
	[-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const XYZ_D65_TO_LINEAR_SRGB: readonly Vec3[] = [
	[3.2409699419045226, -1.537383177570094, -0.4986107602930034],
	[-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
	[0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
// lab() and lch(): CSS Color 4 places Lab on a D50 white with a Bradford
// adaptation to D65. Remotion converts with the D65 white (0.95047, 1,
// 1.08883) directly, no adaptation, and the classic 7-digit XYZ to linear
// sRGB matrix (Lindbloom). Both were identified black-box against the
// oracle; we use them so these colors render the same pixels as in Remotion.
const XYZ_D65_TO_LINEAR_SRGB_LAB: readonly Vec3[] = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.969266, 1.8760108, 0.041556],
	[0.0556434, -0.2040259, 1.0572252],
];
const D65_WHITE: Vec3 = [0.95047, 1, 1.08883];

const xyzD65ToSrgb = (xyz: Vec3): Vec3 =>
	multiply(XYZ_D65_TO_LINEAR_SRGB, xyz).map(gammaEncode) as Vec3;

const oklabToSrgb = (l: number, a: number, b: number): Vec3 => {
	const lms = multiply(OKLAB_TO_LMS, [l, a, b]).map((c) => c ** 3) as Vec3;
	return xyzD65ToSrgb(multiply(LMS_TO_XYZ_D65, lms));
};

const labToSrgb = (l: number, a: number, b: number): Vec3 => {
	const kappa = 24389 / 27;
	const epsilon = 216 / 24389;
	const f1 = (l + 16) / 116;
	const f0 = a / 500 + f1;
	const f2 = f1 - b / 200;
	const xyz: Vec3 = [
		(f0 ** 3 > epsilon ? f0 ** 3 : (116 * f0 - 16) / kappa) * D65_WHITE[0],
		(l > kappa * epsilon ? f1 ** 3 : l / kappa) * D65_WHITE[1],
		(f2 ** 3 > epsilon ? f2 ** 3 : (116 * f2 - 16) / kappa) * D65_WHITE[2],
	];
	return multiply(XYZ_D65_TO_LINEAR_SRGB_LAB, xyz).map(gammaEncode) as Vec3;
};

const polar = (chroma: number, hueDegrees: number): [number, number] => {
	const radians = (hueDegrees * Math.PI) / 180;
	return [chroma * Math.cos(radians), chroma * Math.sin(radians)];
};

/** A component of a modern color function: `none` is 0, `percent` scales a trailing %. */
const component = (text: string, percent: number) => {
	if (text === "none") return 0;
	if (text.endsWith("%")) return (Number(text.slice(0, -1)) / 100) * percent;
	return Number(text);
};

const HUE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const hueComponent = (text: string) => {
	if (text === "none") return 0;
	const match = /^(.*?)(deg|grad|rad|turn)?$/.exec(text);
	const value = Number(match?.[1]);
	const degrees = value * (HUE_UNITS[match?.[2] ?? "deg"] ?? 1);
	return ((degrees % 360) + 360) % 360;
};

const parseModern = (match: RegExpExecArray): Rgba8 => {
	const [, name, c1 = "", c2 = "", c3 = "", alpha] = match;
	// A hue unit is only valid on the hue component, and % never is.
	const isHue = (c: string) => /(deg|grad|rad|turn)$/.test(c);
	const hueIndex = name === "hwb" ? 0 : name === "oklch" || name === "lch" ? 2 : -1;
	[c1, c2, c3].forEach((c, i) => {
		if (isHue(c) && i !== hueIndex) throw invalid(match.input);
		if (i === hueIndex && c.endsWith("%")) throw invalid(match.input);
	});
	if (alpha !== undefined && isHue(alpha)) throw invalid(match.input);

	let rgb: Vec3;
	switch (name) {
		case "oklab":
			rgb = oklabToSrgb(clamp(component(c1, 1), 0, 1), component(c2, 0.4), component(c3, 0.4));
			break;
		case "oklch": {
			const [a, b] = polar(Math.max(0, component(c2, 0.4)), hueComponent(c3));
			rgb = oklabToSrgb(clamp(component(c1, 1), 0, 1), a, b);
			break;
		}
		case "lab":
			rgb = labToSrgb(clamp(component(c1, 100), 0, 100), component(c2, 125), component(c3, 125));
			break;
		case "lch": {
			const [a, b] = polar(Math.max(0, component(c2, 150)), hueComponent(c3));
			rgb = labToSrgb(clamp(component(c1, 100), 0, 100), a, b);
			break;
		}
		default:
			// Whiteness and blackness: 10% is 0.1, and a bare number is the fraction itself.
			rgb = hwbToRgb(hueComponent(c1), component(c2, 1), component(c3, 1));
	}
	const a = alpha === undefined ? 1 : component(alpha, 1);
	return [toByte(rgb[0]), toByte(rgb[1]), toByte(rgb[2]), toByte(a)];
};

/**
 * Parses a CSS color string into 8-bit RGBA, accepting the formats Remotion's
 * `interpolateColors()` accepts: CSS named colors and `transparent`
 * (lowercase), `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, comma-separated
 * `rgb()`, `rgba()`, `hsl()`, `hsla()`, and space-separated `oklch()`,
 * `oklab()`, `lab()`, `lch()`, `hwb()` with an optional `/ alpha`.
 * Throws `invalid color string <value> provided` for anything else.
 */
export const parseColor = (value: unknown): Rgba8 => {
	if (typeof value !== "string") throw invalid(value);
	if (value === "transparent") return [0, 0, 0, 0];
	const named = Object.hasOwn(NAMED_COLORS, value) ? NAMED_COLORS[value] : undefined;
	if (named !== undefined) return [(named >>> 16) & 0xff, (named >>> 8) & 0xff, named & 0xff, 255];

	const hex = HEX.exec(value);
	if (hex?.[1] !== undefined) return parseHex(hex[1]);

	const rgb = RGB.exec(value) ?? RGBA.exec(value);
	if (rgb) {
		const [, r = "", g = "", b = "", a] = rgb;
		return [rgbChannel(r), rgbChannel(g), rgbChannel(b), a === undefined ? 255 : alphaByte(a)];
	}

	const hsl = HSL.exec(value) ?? HSLA.exec(value);
	if (hsl) {
		const [, h = "", s = "", l = "", a] = hsl;
		const [r, g, b] = hslToRgb(Number(h), Number(s) / 100, Number(l) / 100);
		return [toByte(r), toByte(g), toByte(b), a === undefined ? 255 : alphaByte(a)];
	}

	const modern = MODERN.exec(value);
	if (modern) return parseModern(modern);

	throw invalid(value);
};
