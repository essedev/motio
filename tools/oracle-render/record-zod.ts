// Records which inputs the published @remotion/zod-types schemas accept (public API only).
// Run: pnpm record:zod
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zColor, zMatrix, zTextarea } from "@remotion/zod-types";

const here = import.meta.dirname;
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const colors = [
	"#fff",
	"#FFF",
	"#ffff",
	"#ffffff",
	"#ffffff80",
	"#fffff",
	"#ggg",
	"fff",
	"#",
	"",
	"red",
	"Red",
	"RED",
	"transparent",
	"rebeccapurple",
	"currentcolor",
	"notacolor",
	"rgb(255, 0, 0)",
	"rgb(255,0,0)",
	"rgba(255, 0, 0, 0.5)",
	"rgb(255 0 0)",
	"rgb(255 0 0 / 50%)",
	"rgb(100%, 0%, 0%)",
	"rgb(300, 0, 0)",
	"hsl(120, 100%, 50%)",
	"hsla(120, 100%, 50%, 0.3)",
	"hsl(120 100% 50%)",
	"hwb(120 0% 0%)",
	"lab(50% 40 59)",
	"oklch(60% 0.15 50)",
	"color(srgb 1 0 0)",
	" red",
	"red ",
	"#FFF ",
	"inherit",
	"rgb(1,2,3)",
	"rgb( 1 , 2 , 3 )",
	"rgb(1.5,2,3)",
	"rgb(-1,2,3)",
	"RGB(1,2,3)",
	"rgba(1,2,3)",
	"rgb(1,2,3,0.5)",
	"rgba(1,2,3,50%)",
	"rgba(1,2,3,.5)",
	"rgba(1,2,3,1.5)",
	"hsl(120, 100, 50)",
	"hsl(120deg,100%,50%)",
	"hsla(120,100%,50%)",
	"hsl(120,100%,50%,0.5)",
	"hsl(-30,50.5%,10%)",
	"hwb(120,0%,0%)",
	"hwb(120 0% 0% / 0.5)",
	"hwb(120 0 0)",
	"hwb(120 0% 0% / 50%)",
	"lab(50 40 59)",
	"lab(50%,40,59)",
	"lch(50% 40 59)",
	"oklab(0.5 0.1 0.1)",
	"oklch(0.6 0.15 50)",
	"oklch(60% 0.15 50 / 0.5)",
	"oklch(60% -0.15 50)",
	"lab(foo)",
	"oklch()",
	"hwb()",
	"lab(50% 40 59",
	"xyz(1 2 3)",
	"lab(50 40)",
	"lab(50 40 59 1)",
	"#abcdeg",
	"aliceblue",
	"AliceBlue",
	"grey",
	"darkgrey",
	"cyan",
	"aqua",
];
const values: unknown[] = [...colors, 123, null, undefined, {}, []];
const matrices: unknown[] = [
	[],
	[1],
	[0, 1, 1, 0],
	[1, 0, 0, 0, 1, 0, 0, 0, 1],
	Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)),
	[1, 2, 3],
	[1, 2, 3, 4, 5, 6],
	[
		[1, 0],
		[0, 1],
	],
	["1", "0", "0", "1"],
	[1, 0, 0, Number.NaN],
	[1, 0, 0, Number.POSITIVE_INFINITY],
	"1,0,0,1",
	null,
	Array.from({ length: 25 }, () => 0),
];
const texts: unknown[] = ["", "a", "line1\nline2", 5, null, undefined];

const record = (
	schema: { safeParse(v: unknown): { success: boolean; data?: unknown } },
	inputs: unknown[],
) =>
	inputs.map((input) => {
		const r = schema.safeParse(input);
		return {
			input: input === undefined ? "__undefined__" : input,
			success: r.success,
			...(r.success ? { data: r.data === undefined ? "__undefined__" : r.data } : {}),
		};
	});

const out = {
	remotion: pkg.dependencies["@remotion/zod-types"],
	zod: pkg.dependencies.zod,
	zColor: record(zColor(), values),
	zMatrix: record(zMatrix(), matrices),
	zTextarea: record(zTextarea(), texts),
};
const dir = resolve(here, "../../fixtures/zod-types/__golden__/remotion");
mkdirSync(dir, { recursive: true });
writeFileSync(
	join(dir, "zod-types.json"),
	`${JSON.stringify(out, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v), "\t")}\n`,
);
console.log("recorded");
