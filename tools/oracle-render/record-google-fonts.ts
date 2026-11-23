// Records the font list and a sample of getInfo() from the published @remotion/google-fonts
// (public API only). Run: pnpm record:google-fonts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAvailableFonts } from "@remotion/google-fonts";

const here = import.meta.dirname;
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const fonts = getAvailableFonts();
const sampleNames = [
	"Inter",
	"TitanOne",
	"Roboto",
	"NotoSans",
	"AbhayaLibre",
	"Lobster",
	"SourceCodePro",
	"PlayfairDisplay",
];
const samples: Record<string, unknown> = {};
for (const name of sampleNames) {
	const f = fonts.find((x) => x.importName === name);
	if (!f) continue;
	const mod = (await f.load()) as { getInfo(): Record<string, unknown> };
	const info = mod.getInfo();
	samples[name] = { exports: Object.keys(mod).sort(), info };
}
const dir = resolve(here, "../../fixtures/google-fonts/__golden__/remotion");
mkdirSync(dir, { recursive: true });
writeFileSync(
	join(dir, "fonts.json"),
	`${JSON.stringify({ remotion: pkg.dependencies["@remotion/google-fonts"], fonts: fonts.map((f) => ({ fontFamily: f.fontFamily, importName: f.importName })) }, null, "\t")}\n`,
);
writeFileSync(join(dir, "samples.json"), `${JSON.stringify(samples, null, "\t")}\n`);
console.log(`${fonts.length} fonts, ${Object.keys(samples).length} samples`);
