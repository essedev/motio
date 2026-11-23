// Runs the published @remotion/renderer media functions (getVideoMetadata, getSilentParts,
// extractAudio; public API only) on the files in fixtures/node-api/media and records what they
// return, or the error they throw, in fixtures/node-api/__oracle__/remotion.json.
// Run: pnpm record:node-api
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractAudio, getSilentParts, getVideoMetadata } from "@remotion/renderer";

const here = import.meta.dirname;
const fixture = resolve(here, "../../fixtures/node-api");
const media = join(fixture, "media");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const remotionVersion: string = pkg.dependencies["@remotion/renderer"];

async function capture<T>(fn: () => Promise<T>): Promise<{ out: T } | { error: string }> {
	try {
		return { out: await fn() };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

const METADATA_FILES = [
	"gaps.mp4",
	"faststart.mp4",
	"h264.mkv",
	"vp9-opus.webm",
	"rotated.mp4",
	"hevc-10bit.mp4",
	"prores.mov",
	"tone.mp3",
	"gaps.wav",
];
const metadata: Record<string, unknown> = {};
for (const file of METADATA_FILES) {
	metadata[file] = await capture(() => getVideoMetadata(join(media, file), { logLevel: "error" }));
}
// Relative to the working directory, which the docs say not to pass.
metadata["relative:gaps.mp4"] = await capture(() =>
	getVideoMetadata("../../fixtures/node-api/media/gaps.mp4", { logLevel: "error" }),
);
metadata["missing.mp4"] = await capture(() =>
	getVideoMetadata(join(media, "missing.mp4"), { logLevel: "error" }),
);

const SILENCE_CASES: {
	src: string;
	noiseThresholdInDecibels?: number;
	minDurationInSeconds?: number;
}[] = [
	{ src: "gaps.wav" },
	{ src: "gaps.wav", minDurationInSeconds: 0.5 },
	{ src: "gaps.wav", noiseThresholdInDecibels: -30 },
	{ src: "gaps.wav", noiseThresholdInDecibels: -30, minDurationInSeconds: 0.5 },
	{ src: "gaps.wav", minDurationInSeconds: 0.1 },
	{ src: "gaps.mp4" },
	{ src: "gaps.mp4", noiseThresholdInDecibels: -30, minDurationInSeconds: 0.5 },
	{ src: "tone.mp3" },
	{ src: "silence.wav" },
	{ src: "faststart.mp4" },
	{ src: "gaps.wav", noiseThresholdInDecibels: 30 },
	{ src: "gaps.wav", noiseThresholdInDecibels: 0 },
	{ src: "gaps.wav", minDurationInSeconds: 0 },
	{ src: "gaps.wav", minDurationInSeconds: -1 },
	{ src: "gaps.mp4", noiseThresholdInDecibels: 0 },
	{ src: "gaps.mp4", noiseThresholdInDecibels: 10 },
	{ src: "gaps.mp4", noiseThresholdInDecibels: -60 },
	{ src: "gaps.mp4", minDurationInSeconds: 0.1 },
	{ src: "gaps.mp4", minDurationInSeconds: 3 },
	{ src: "prores.mov" },
	{ src: "prores.mov", noiseThresholdInDecibels: 0 },
	{ src: "vp9-opus.webm" },
	{ src: "vp9-opus.webm", noiseThresholdInDecibels: 0 },
	{ src: "missing.mp4" },
];
const silentParts = [];
for (const c of SILENCE_CASES) {
	const result = await capture(() =>
		getSilentParts({ ...c, src: join(media, c.src), logLevel: "error" }),
	);
	silentParts.push({ input: c, ...result });
}

// What the extracted file holds: its streams as ffprobe sees them and a digest of the decoded
// samples, so a stream copy and a re-encode can be told apart.
function describe(path: string) {
	const probe = spawnSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-show_entries",
			"format=format_name:stream=codec_type,codec_name,sample_rate,channels",
			"-of",
			"json",
			path,
		],
		{ encoding: "utf8" },
	);
	const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-f", "s16le", "-"], {
		maxBuffer: 1 << 28,
	});
	const json = JSON.parse(probe.stdout);
	return {
		format: json.format?.format_name,
		streams: json.streams,
		samples: pcm.stdout.length / 2,
		pcmSha256: createHash("sha256").update(pcm.stdout).digest("hex"),
	};
}

const EXTRACT_CASES = [
	{ videoSource: "gaps.mp4", ext: "aac" },
	{ videoSource: "gaps.mp4", ext: "m4a" },
	{ videoSource: "gaps.mp4", ext: "mp3" },
	{ videoSource: "vp9-opus.webm", ext: "opus" },
	{ videoSource: "vp9-opus.webm", ext: "webm" },
	{ videoSource: "prores.mov", ext: "wav" },
	{ videoSource: "tone.mp3", ext: "mp3" },
	{ videoSource: "faststart.mp4", ext: "aac" },
];
const tmp = mkdtempSync(join(tmpdir(), "oracle-node-api-"));
const extract = [];
try {
	for (const c of EXTRACT_CASES) {
		const audioOutput = join(tmp, `${c.videoSource}.${c.ext}`);
		const result = await capture(async () => {
			await extractAudio({
				videoSource: join(media, c.videoSource),
				audioOutput,
				logLevel: "error",
			});
			return describe(audioOutput);
		});
		extract.push({ input: c, ...result });
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

// The media and temporary paths in messages are machine-specific.
const body = JSON.stringify(
	{
		remotionVersion,
		description:
			"@remotion/renderer getVideoMetadata, getSilentParts and extractAudio on fixtures/node-api/media",
		getVideoMetadata: metadata,
		getSilentParts: silentParts,
		extractAudio: extract,
	},
	null,
	"\t",
)
	.replaceAll(media, "<media>")
	.replaceAll(tmp, "<tmp>");
mkdirSync(join(fixture, "__oracle__"), { recursive: true });
writeFileSync(join(fixture, "__oracle__/remotion.json"), `${body}\n`);
console.log("fixtures/node-api/__oracle__/remotion.json written");
// Remotion's compositor processes stay alive after the calls and would keep Node running.
process.exit(0);
