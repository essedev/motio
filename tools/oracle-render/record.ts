// Renders fixtures/compositions with the published Remotion at the pinned version and writes
// reference stills plus resolved composition metadata. Uses public APIs only (clean room:
// never open files under node_modules). Run: pnpm record [fixture] [--gl=<renderer>], fixture
// defaults to "compositions" (any folder under fixtures/ with src/index.ts, public/ and
// frames.json). --gl sets chromiumOptions.gl: WebGL fixtures record with --gl=swangle, the
// software renderer Motio uses by default, so both sides rasterise WebGL the same way.
// --image-format=jpeg records the stills as JPEG (quality 80, the video default) into
// __golden__/remotion-jpeg instead, without metadata: the reference for the default capture path.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill, selectComposition } from "@remotion/renderer";

const here = import.meta.dirname;
const args = process.argv.slice(2);
const fixtureName = args.find((a) => !a.startsWith("--")) ?? "compositions";
const gl = args.find((a) => a.startsWith("--gl="))?.slice("--gl=".length);
const chromiumOptions = gl ? { gl: gl as "swangle" } : {};
const imageFormat = args.includes("--image-format=jpeg") ? "jpeg" : "png";
const fixture = resolve(here, "../../fixtures", fixtureName);
const work = join(here, `.work-${fixtureName}`);
const out = join(
	fixture,
	imageFormat === "jpeg" ? "__golden__/remotion-jpeg" : "__golden__/remotion",
);
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;
const frames = JSON.parse(readFileSync(join(fixture, "frames.json"), "utf8")) as Record<
	string,
	number[]
>;

rmSync(work, { recursive: true, force: true });
cpSync(join(fixture, "src"), join(work, "src"), { recursive: true });
cpSync(join(fixture, "public"), join(work, "public"), { recursive: true });

const serveUrl = await bundle({
	entryPoint: join(work, "src/index.ts"),
	publicDir: join(work, "public"),
});
const comps = await getCompositions(serveUrl, { inputProps: {}, chromiumOptions });
const metadata: Record<string, unknown> = {
	remotion: version,
	...(gl ? { gl } : {}),
	compositions: {},
};
rmSync(out, { recursive: true, force: true });

for (const { id } of comps) {
	const composition = await selectComposition({ serveUrl, id, inputProps: {}, chromiumOptions });
	(metadata.compositions as Record<string, unknown>)[id] = {
		width: composition.width,
		height: composition.height,
		fps: composition.fps,
		durationInFrames: composition.durationInFrames,
		defaultProps: composition.defaultProps,
		props: composition.props,
	};
	const list = frames[id];
	if (!list) throw new Error(`frames.json has no entry for composition ${id}`);
	mkdirSync(join(out, id), { recursive: true });
	for (const frame of list) {
		await renderStill({
			composition,
			serveUrl,
			frame,
			imageFormat,
			...(imageFormat === "jpeg" ? { jpegQuality: 80 } : {}),
			output: join(out, id, `${String(frame).padStart(4, "0")}.${imageFormat}`),
			inputProps: {},
			chromiumOptions,
		});
	}
	console.log(`${id}: ${list.length} stills`);
}
if (imageFormat === "png") {
	writeFileSync(join(out, "metadata.json"), `${JSON.stringify(metadata, null, "\t")}\n`);
}
rmSync(work, { recursive: true, force: true });
