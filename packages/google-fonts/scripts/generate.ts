// Generates one module per Google Font in src/fonts/ and the font list in src/font-list.ts.
// The set of families is the one @remotion/google-fonts 4.0.545 ships (recorded in
// fixtures/google-fonts), intersected with what Google Fonts serves today. Run: pnpm generate
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cssFamilyName } from "../src/css-family-name.ts";

const here = import.meta.dirname;
const out = resolve(here, "../src/fonts");
const target = JSON.parse(
	readFileSync(
		resolve(here, "../../../fixtures/google-fonts/__golden__/remotion/fonts.json"),
		"utf8",
	),
) as {
	fonts: { fontFamily: string; importName: string }[];
};
// This user agent makes Google serve the same woff2 files @remotion/google-fonts references (checked
// against the recorded samples); other agents get differently subset files with different metrics.
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Meta {
	family: string;
	subsets: string[];
	fonts: Record<string, unknown>;
	axes: { tag: string; min: number; max: number }[];
}

async function get(url: string, attempt = 0): Promise<string> {
	const res = await fetch(url, { headers: { "user-agent": UA } });
	if (res.ok) return res.text();
	if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
		await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
		return get(url, attempt + 1);
	}
	throw new Error(`${res.status} for ${url}`);
}

interface Face {
	subset: string;
	style: string;
	weight: string;
	stretch: string | null;
	src: string;
	unicodeRange: string;
}

function parseCss(css: string): Face[] {
	const faces: Face[] = [];
	const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
	for (let m = re.exec(css); m; m = re.exec(css)) {
		const body = m[2] ?? "";
		const prop = (name: string) =>
			new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? null;
		const src = /url\(([^)]+)\)/.exec(body)?.[1];
		if (!src) continue;
		faces.push({
			subset: m[1] ?? "",
			style: prop("font-style") ?? "normal",
			weight: prop("font-weight") ?? "400",
			stretch: prop("font-stretch"),
			src,
			unicodeRange: prop("unicode-range") ?? "",
		});
	}
	return faces;
}

const familyParam = (family: string) => family.replace(/ /g, "+");

function staticUrl(meta: Meta): string {
	const tuples = Object.keys(meta.fonts)
		.map((k) => ({ ital: k.endsWith("i") ? 1 : 0, wght: Number.parseInt(k, 10) }))
		.sort((a, b) => a.ital - b.ital || a.wght - b.wght)
		.map((t) => `${t.ital},${t.wght}`);
	return `https://fonts.googleapis.com/css2?family=${familyParam(meta.family)}:ital,wght@${tuples.join(";")}`;
}

function variableUrl(meta: Meta): string | null {
	const axes = meta.axes.filter((a) => a.min !== a.max);
	if (axes.length === 0) return null;
	// Google requires lower-case axes alphabetically, then upper-case ones.
	const sorted = [...axes].sort((a, b) => {
		const al = a.tag === a.tag.toLowerCase();
		const bl = b.tag === b.tag.toLowerCase();
		if (al !== bl) return al ? -1 : 1;
		return a.tag < b.tag ? -1 : 1;
	});
	const hasItalic = Object.keys(meta.fonts).some((k) => k.endsWith("i"));
	const range = sorted.map((a) => `${a.min}..${a.max}`).join(",");
	const tags = sorted.map((a) => a.tag).join(",");
	const tuples = hasItalic ? `0,${range};1,${range}` : `0,${range}`;
	return `https://fonts.googleapis.com/css2?family=${familyParam(meta.family)}:ital,${tags}@${tuples}`;
}

const metaText = await get("https://fonts.google.com/metadata/fonts");
const metaList = (
	JSON.parse(metaText.slice(metaText.indexOf("{"))) as { familyMetadataList: Meta[] }
).familyMetadataList;
const byFamily = new Map(metaList.map((m) => [m.family, m]));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const generated: { fontFamily: string; importName: string }[] = [];
const missing: string[] = [];
const queue = [...target.fonts];

async function work() {
	for (let item = queue.shift(); item; item = queue.shift()) {
		const meta = byFamily.get(item.fontFamily);
		if (!meta) {
			missing.push(item.fontFamily);
			continue;
		}
		try {
			const url = staticUrl(meta);
			const faces = parseCss(await get(url));
			const fonts: Record<string, Record<string, Record<string, string>>> = {};
			const unicodeRanges: Record<string, string> = {};
			for (const f of faces) {
				fonts[f.style] ??= {};
				const byWeight = fonts[f.style] as Record<string, Record<string, string>>;
				byWeight[f.weight] ??= {};
				const bySubset = byWeight[f.weight] as Record<string, string>;
				bySubset[f.subset] = f.src;
				unicodeRanges[f.subset] ??= f.unicodeRange;
			}
			const version = /\/(v\d+)\//.exec(faces[0]?.src ?? "")?.[1] ?? "";
			const info: Record<string, unknown> = {
				// The CSS-safe name the module registers and returns; the font list keeps the real one.
				fontFamily: cssFamilyName(meta.family),
				importName: item.importName,
				version,
				url,
				unicodeRanges,
				fonts,
				subsets: meta.subsets.filter((s) => s !== "menu"),
			};
			const vUrl = variableUrl(meta);
			if (vUrl) {
				const vFaces = parseCss(await get(vUrl).catch(() => ""));
				if (vFaces.length > 0) {
					info.variable = {
						axes: Object.fromEntries(
							meta.axes
								.filter((a) => a.min !== a.max)
								.map((a) => [a.tag, { min: a.min, max: a.max }]),
						),
						fontFaces: vFaces.map((f) => ({
							style: f.style,
							weight: f.weight,
							stretch: f.stretch,
							subset: f.subset,
							unicodeRange: f.unicodeRange,
							src: f.src,
						})),
						url: vUrl,
					};
				}
			}
			const hasVariable = info.variable !== undefined;
			const src = [
				"// Generated by scripts/generate.ts from Google Fonts. Do not edit.",
				`import { createFontModule } from "../create-font-module.js";`,
				"",
				`const info = ${JSON.stringify(info)} as const;`,
				"",
				`const mod = createFontModule(info);`,
				"/** The CSS font family name. */",
				"export const fontFamily = mod.fontFamily;",
				"/** Static information about the font: files per style, weight and subset. */",
				"export const getInfo = mod.getInfo;",
				"/** Loads the font, blocking the render until it is ready. */",
				"export const loadFont = mod.loadFont;",
				...(hasVariable
					? [
							"/** Loads the variable font faces for a style. */",
							"export const loadVariableFont = mod.loadVariableFont;",
						]
					: []),
				"",
			].join("\n");
			writeFileSync(join(out, `${item.importName}.ts`), src);
			generated.push(item);
		} catch (e) {
			missing.push(`${item.fontFamily} (${(e as Error).message})`);
		}
	}
}
await Promise.all(Array.from({ length: 8 }, work));
generated.sort((a, b) => (a.importName < b.importName ? -1 : 1));
const list = [
	"// Generated by scripts/generate.ts. Do not edit.",
	"export const FONT_LIST = [",
	...generated.map(
		(g) =>
			`\t{ fontFamily: ${JSON.stringify(g.fontFamily)}, importName: ${JSON.stringify(g.importName)}, load: () => import("./fonts/${g.importName}.js") },`,
	),
	"] as const;",
	"",
].join("\n");
writeFileSync(resolve(here, "../src/font-list.ts"), list);
writeFileSync(
	resolve(here, "../generate-report.json"),
	`${JSON.stringify({ generated: generated.length, missing }, null, "\t")}\n`,
);
console.log(`generated ${generated.length}, missing ${missing.length}`);
