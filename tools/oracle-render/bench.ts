// Remotion side of the throughput benchmark (tools/benchmark, ROADMAP "Performance"): renders the
// benchmark compositions with the published Remotion at the pinned version and prints one JSON
// line per render. Public APIs only (clean room: never open files under node_modules).
// Usage: node bench.ts --compositions motion,timeline --concurrency 1,4,8 --runs 3 --scale 3
//   --frames 60 --warmup 1 --out <dir>. The first warm-up render also prints {"env": {...}} with
//   the versions of the browser and FFmpeg Remotion ran.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const { values } = parseArgs({
	options: {
		compositions: { type: "string", default: "motion,timeline" },
		concurrency: { type: "string", default: "1,4,8" },
		runs: { type: "string", default: "3" },
		scale: { type: "string", default: "3" },
		frames: { type: "string", default: "60" },
		warmup: { type: "string", default: "1" },
		out: { type: "string" },
	},
});

const here = import.meta.dirname;
const fixture = resolve(here, "../../fixtures/compositions");
const work = join(here, ".work-bench");
const out = values.out ?? join(work, "out");
const ids = values.compositions.split(",");
const concurrencies = values.concurrency.split(",").map(Number);
const runs = Number(values.runs);
const scale = Number(values.scale);
const frameCount = Number(values.frames);
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;

rmSync(work, { recursive: true, force: true });
cpSync(join(fixture, "src"), join(work, "src"), { recursive: true });
cpSync(join(fixture, "public"), join(work, "public"), { recursive: true });
mkdirSync(out, { recursive: true });

const serveUrl = await bundle({
	entryPoint: join(work, "src/index.ts"),
	publicDir: join(work, "public"),
});
const compositions = new Map(
	await Promise.all(
		ids.map(async (id) => [id, await selectComposition({ serveUrl, id, inputProps: {} })] as const),
	),
);

async function render(id: string, concurrency: number): Promise<number> {
	const composition = compositions.get(id);
	if (!composition) throw new Error(`no composition ${id}`);
	const start = performance.now();
	await renderMedia({
		composition,
		serveUrl,
		codec: "h264",
		crf: 18,
		muted: true,
		scale,
		concurrency,
		frameRange: [0, frameCount - 1],
		outputLocation: join(out, `remotion-${id}-${concurrency}.mp4`),
		inputProps: {},
		logLevel: "error",
	});
	return performance.now() - start;
}

/**
 * Remotion runs its own browser and FFmpeg builds. Their versions are recorded by observing the
 * command lines of this process's children during the warm-up render and running each
 * executable with its version flag.
 */
function observeChildren(): { stop: () => Record<string, string> } {
	const found = new Map<string, string>();
	const timer = setInterval(() => {
		const ps = execFileSync("ps", ["-ww", "-ax", "-o", "pid=,ppid=,command="], {
			encoding: "utf8",
		});
		const rows = ps.split("\n").map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l));
		const tree = new Set([process.pid]);
		for (let grew = true; grew; ) {
			grew = false;
			for (const r of rows) {
				if (r && tree.has(Number(r[2])) && !tree.has(Number(r[1]))) {
					tree.add(Number(r[1]));
					grew = true;
				}
			}
		}
		for (const r of rows) {
			if (!r || !tree.has(Number(r[1]))) continue;
			const chrome = /^(\S*chrome-headless-shell)\s/.exec(r[3] as string);
			if (chrome) found.set("chrome", chrome[1] as string);
			const ffmpeg = /^(\S*\/ffmpeg)\s/.exec(r[3] as string);
			if (ffmpeg) found.set("ffmpeg", ffmpeg[1] as string);
		}
	}, 100);
	return {
		stop: () => {
			clearInterval(timer);
			const version = (bin: string | undefined, flag: string) => {
				if (!bin) return "unknown";
				try {
					// Remotion's FFmpeg loads its libraries from its own directory.
					return (
						execFileSync(bin, [flag], {
							encoding: "utf8",
							cwd: dirname(bin),
							stdio: ["ignore", "pipe", "ignore"],
						})
							.split("\n")[0]
							?.trim() ?? ""
					);
				} catch {
					return `unknown (${bin})`;
				}
			};
			return {
				chrome: version(found.get("chrome"), "--version"),
				ffmpeg: version(found.get("ffmpeg"), "-version"),
			};
		},
	};
}

const observer = observeChildren();
await render(ids[0] as string, concurrencies[0] ?? 1);
console.log(JSON.stringify({ env: { remotion: version, ...observer.stop() } }));
for (let i = 1; i < Number(values.warmup); i++)
	await render(ids[0] as string, concurrencies[0] ?? 1);
for (let run = 0; run < runs; run++) {
	for (const concurrency of concurrencies) {
		for (const id of ids) {
			const ms = await render(id, concurrency);
			console.log(
				JSON.stringify({ side: "remotion", composition: id, concurrency, frames: frameCount, ms }),
			);
		}
	}
}
rmSync(work, { recursive: true, force: true });
