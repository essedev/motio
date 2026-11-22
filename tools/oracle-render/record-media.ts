// Renders fixtures/media with the published Remotion and records, per composition, which source
// frame every output frame shows (decoded frame stamps) and where audio clicks land. Public APIs
// only (clean room). Run: pnpm record:media
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderFrames, renderMedia, selectComposition } from "@remotion/renderer";
import { decodeFrameStamp } from "../../packages/testing/src/frame-stamp.ts";

const here = import.meta.dirname;
const fixture = resolve(here, "../../fixtures/media");
const work = join(here, ".work-media");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;
const STAMP = { x: 48, y: 127, blockSize: 16 } as const;

function rgba(file: string, w: number, h: number): Buffer {
	const r = spawnSync(
		"ffmpeg",
		["-loglevel", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
		{ maxBuffer: 1 << 28 },
	);
	if (r.status !== 0 || r.stdout.length !== w * h * 4) throw new Error(`decode failed for ${file}`);
	return r.stdout;
}

function clicks(file: string): { t: number; peak: number }[] {
	const r = spawnSync(
		"ffmpeg",
		["-loglevel", "error", "-i", file, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
		{ maxBuffer: 1 << 28 },
	);
	const s = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
	const out: { t: number; peak: number }[] = [];
	let quiet = 1000;
	for (let i = 0; i < s.length; i++) {
		const a = Math.abs(s[i] ?? 0);
		if (a > 0.02 && quiet >= 96) {
			let peak = 0;
			for (let j = i; j < Math.min(s.length, i + 48); j++)
				peak = Math.max(peak, Math.abs(s[j] ?? 0));
			out.push({ t: Number((i / 48000).toFixed(6)), peak: Number(peak.toFixed(4)) });
		}
		quiet = a > 0.02 ? 0 : quiet + 1;
	}
	return out;
}

rmSync(work, { recursive: true, force: true });
cpSync(join(fixture, "src"), join(work, "src"), { recursive: true });
cpSync(join(fixture, "public"), join(work, "public"), { recursive: true });
const serveUrl = await bundle({
	entryPoint: join(work, "src/index.ts"),
	publicDir: join(work, "public"),
});
const comps = await getCompositions(serveUrl, { inputProps: {} });
const result: Record<string, unknown> = { remotion: version, video: {}, audio: {} };

for (const { id } of comps) {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	if (id.startsWith("audio-")) {
		const out = join(work, `${id}.wav`);
		await renderMedia({ composition, serveUrl, codec: "wav", outputLocation: out, inputProps: {} });
		(result.audio as Record<string, unknown>)[id] = clicks(out);
	} else {
		const dir = join(work, id);
		mkdirSync(dir, { recursive: true });
		await renderFrames({
			composition,
			serveUrl,
			outputDir: dir,
			imageFormat: "png",
			inputProps: {},
			onStart: () => {},
			onFrameUpdate: () => {},
		});
		const files = readdirSync(dir)
			.filter((f) => f.endsWith(".png"))
			.sort();
		(result.video as Record<string, unknown>)[id] = files.map((f) => {
			const d = decodeFrameStamp(
				rgba(join(dir, f), composition.width, composition.height),
				composition.width,
				composition.height,
				STAMP,
			);
			return d.ok ? d.frame : null;
		});
	}
	console.log(`${id} done`);
}
const outDir = join(fixture, "__golden__/remotion");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "media.json"), `${JSON.stringify(result, null, "\t")}\n`);
rmSync(work, { recursive: true, force: true });
