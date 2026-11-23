// Records exports of the published `remotion` package that are plain data or
// thin checks with no docs page: `absoluteFillSchema`, the shape and message of
// the deprecated `Config` export, and the option checks re-exported by
// `remotion/no-react`. Called by record.mjs; public API only.

import { spawnSync } from "node:child_process";
import { absoluteFillSchema, Config } from "remotion";
import {
	assertValidInterpolateEasingOption,
	assertValidInterpolatePosterizeOption,
} from "remotion/no-react";
import { captureTyped, tag } from "./record-interpolate-outputs.mjs";

// Argument specs, rebuilt by the Motio test: { $fn: true } is a function,
// { $u: true } undefined, { $n: "NaN" } a non-finite number, arrays hold specs.
const FN = { $fn: true };
const build = (spec) => {
	if (Array.isArray(spec)) return spec.map(build);
	if (spec !== null && typeof spec === "object") {
		if (spec.$fn) return (t) => t;
		if (spec.$u) return undefined;
		if (spec.$n !== undefined) return Number(spec.$n);
		return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, build(v)]));
	}
	return spec;
};

const EASINGS = [
	{ $u: true },
	FN,
	null,
	[],
	[FN],
	[FN, FN],
	[FN, FN, FN],
	[1],
	[FN, 2],
	[FN, null],
	["x"],
	"x",
	"linear",
	1,
	{},
	{ length: 1 },
	{ length: 1, 0: FN },
	true,
];
const LENGTHS = [{ $u: true }, 0, 1, 2, 3, 4, { $n: "NaN" }];
const POSTERIZE = [
	{ $u: true },
	null,
	0,
	{ $n: "-0" },
	1,
	2,
	2.5,
	0.001,
	-1,
	{ $n: "NaN" },
	{ $n: "Infinity" },
	{ $n: "-Infinity" },
	"3",
	true,
	{},
	[2],
];

// The message `Config` prints is written to stderr before the process exits,
// so each probe runs in a child process.
const configCall = (expression) => {
	const child = spawnSync(
		process.execPath,
		["--input-type=module", "-e", `import { Config } from "remotion"; ${expression};`],
		{ encoding: "utf8", cwd: import.meta.dirname },
	);
	return { status: child.status, stdout: child.stdout, stderr: child.stderr };
};

const CONFIG_KEYS = [
	"Rendering",
	"Output",
	"Bundling",
	"Log",
	"Puppeteer",
	"Preview",
	"Studio",
	"setCodec",
	"overrideWebpackConfig",
	"setConcurrency",
	"anything",
	"then",
];

export const recordExports = ({ write }) => {
	write("exports", "Undocumented plain-data exports and option checks of remotion", [
		{ name: "absoluteFillSchema", value: tag(absoluteFillSchema) },
		{
			name: "Config",
			value: {
				ownKeys: Reflect.ownKeys(Config).map(String),
				typeofKeys: Object.fromEntries(CONFIG_KEYS.map((k) => [k, typeof Config[k]])),
				typeofNested: Object.fromEntries(
					["Rendering", "Bundling"].map((ns) => [
						ns,
						{ setCodec: typeof Config[ns].setCodec, Rendering: typeof Config[ns].Rendering },
					]),
				),
				sameNamespace: (() => {
					const first = Config.Rendering;
					return first === Config.Rendering;
				})(),
				sameFunction: (() => {
					const first = Config.setCodec;
					return first === Config.setCodec;
				})(),
				calls: {
					"Config.setCodec('h264')": configCall("Config.setCodec('h264')"),
					"Config.Rendering.setImageFormat('png')": configCall(
						"Config.Rendering.setImageFormat('png')",
					),
					"typeof Config.setCodec": configCall("console.log(typeof Config.setCodec)"),
				},
			},
		},
		{
			name: "assertValidInterpolateEasingOption",
			value: EASINGS.flatMap((easing) =>
				LENGTHS.map((length) => ({
					easing,
					length,
					...captureTyped(() => assertValidInterpolateEasingOption(build(easing), build(length))),
				})),
			).map((c) => ({ ...c, out: c.out === undefined ? undefined : tag(c.out) })),
		},
		{
			name: "assertValidInterpolatePosterizeOption",
			value: POSTERIZE.map((posterize) => ({
				posterize,
				...captureTyped(() => assertValidInterpolatePosterizeOption(build(posterize))),
			})),
		},
	]);
};
