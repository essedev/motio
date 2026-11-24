import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FontInfo } from "./create-font-module.js";
import { cssFamilyName } from "./css-family-name.js";
import { getAvailableFonts } from "./index.js";

const dir = resolve(import.meta.dirname, "../../../fixtures/google-fonts/__golden__/remotion");
const list = JSON.parse(readFileSync(resolve(dir, "fonts.json"), "utf8")) as {
	fonts: { fontFamily: string; importName: string }[];
};
const samples = JSON.parse(readFileSync(resolve(dir, "samples.json"), "utf8")) as Record<
	string,
	{ exports: string[]; info: FontInfo }
>;

const shape = (info: FontInfo) => ({
	fontFamily: info.fontFamily,
	importName: info.importName,
	subsets: [...info.subsets].sort(),
	unicodeRangeSubsets: Object.keys(info.unicodeRanges).sort(),
	fonts: Object.fromEntries(
		Object.entries(info.fonts).map(([style, weights]) => [
			style,
			Object.fromEntries(Object.entries(weights).map(([w, subs]) => [w, Object.keys(subs).sort()])),
		]),
	),
	variable: info.variable
		? {
				axes: info.variable.axes,
				faces: info.variable.fontFaces.map((f) => `${f.style}|${f.weight}|${f.subset}`).sort(),
			}
		: null,
});

const cssNames = JSON.parse(readFileSync(resolve(dir, "css-family-names.json"), "utf8")) as {
	families: { fontFamily: string; module: string; info: string }[];
};

describe("@motiojs/google-fonts against @remotion/google-fonts 4.0.545", () => {
	it(`uses the published CSS family name for the ${cssNames.families.length} families with a digit`, async () => {
		const fonts = new Map(getAvailableFonts().map((f) => [f.fontFamily, f]));
		const ours = await Promise.all(
			cssNames.families.map(async ({ fontFamily }) => {
				const font = fonts.get(fontFamily);
				if (!font) return { fontFamily, module: "(missing)", info: "(missing)" };
				const mod = (await font.load()) as { fontFamily: string; getInfo(): FontInfo };
				return { fontFamily, module: mod.fontFamily, info: mod.getInfo().fontFamily };
			}),
		);
		expect(ours).toEqual(cssNames.families);
		expect(cssFamilyName("Source Serif 4")).toBe("Source Serif Four");
	});

	it("lists the same fonts with the same import names", () => {
		const ours = getAvailableFonts().map((f) => ({
			fontFamily: f.fontFamily,
			importName: f.importName,
		}));
		const key = (f: { importName: string }) => f.importName;
		expect([...ours].sort((a, b) => (key(a) < key(b) ? -1 : 1))).toEqual(
			[...list.fonts].sort((a, b) => (key(a) < key(b) ? -1 : 1)),
		);
	});

	for (const [name, sample] of Object.entries(samples)) {
		it(`${name}: same exports and the same styles, weights, subsets and axes`, async () => {
			const font = getAvailableFonts().find((f) => f.importName === name);
			expect(font).toBeDefined();
			const mod = (await font?.load()) as Record<string, unknown> & { getInfo(): FontInfo };
			expect(Object.keys(mod).sort()).toEqual(sample.exports);
			expect(shape(mod.getInfo())).toEqual(shape(sample.info));
		});

		it(`${name}: the same font files as the published package`, async () => {
			const font = getAvailableFonts().find((f) => f.importName === name);
			expect(font).toBeDefined();
			const mod = (await font?.load()) as { getInfo(): FontInfo } | undefined;
			const info = mod?.getInfo();
			if (!info) throw new Error(`${name} has no getInfo()`);
			expect(info.fonts).toEqual(sample.info.fonts);
			expect(info.unicodeRanges).toEqual(sample.info.unicodeRanges);
			expect(info.variable?.fontFaces.map((f) => f.src).sort()).toEqual(
				sample.info.variable?.fontFaces.map((f) => f.src).sort(),
			);
		});
	}
});
