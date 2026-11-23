// Throughput benchmark of Motio against the pinned Remotion (ROADMAP, Performance). Runs each
// side in its own Node process, alternating which side goes first every round, and prints the
// machine, the browser and FFmpeg versions of both sides and a table of median wall times.
//
//   node tools/benchmark/run.ts [--rounds 2] [--runs 3] [--concurrency 1,4,8]
//     [--compositions motion,timeline] [--scale 3] [--frames 60] [--side both|motio|remotion]
//     [--options '<json merged into Motio's renderMedia options>'] [--json <file>] [--assert]
//
// --assert exits with code 1 unless Motio's median wall time is at most Remotion's at every
// concurrency. The Remotion side needs `pnpm install` in tools/oracle-render once.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CHROME_VERSION, probeFfmpeg } from "@motiojs/renderer";
import { compare, criterionFailures, formatTable, parseSamples, type Sample } from "./stats.ts";

const { values } = parseArgs({
	options: {
		rounds: { type: "string", default: "2" },
		runs: { type: "string", default: "3" },
		concurrency: { type: "string", default: "1,4,8" },
		compositions: { type: "string", default: "motion,timeline" },
		scale: { type: "string", default: "3" },
		frames: { type: "string", default: "60" },
		side: { type: "string", default: "both" },
		options: { type: "string", default: "{}" },
		json: { type: "string" },
		assert: { type: "boolean", default: false },
	},
});

const root = resolve(import.meta.dirname, "../..");
const common = [
	"--compositions",
	values.compositions,
	"--concurrency",
	values.concurrency,
	"--runs",
	values.runs,
	"--scale",
	values.scale,
	"--frames",
	values.frames,
];
const sides = {
	remotion: { cwd: resolve(root, "tools/oracle-render"), args: ["bench.ts", ...common] },
	motio: {
		cwd: root,
		args: ["tools/benchmark/motio.ts", ...common, "--options", values.options],
	},
} as const;
type SideName = keyof typeof sides;

/** Runs one side to completion, echoing its output, and returns what it printed. */
function runSide(name: SideName): Promise<string> {
	const { cwd, args } = sides[name];
	return new Promise((ok, fail) => {
		const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
		let out = "";
		child.stdout.on("data", (c: Buffer) => {
			const text = c.toString();
			out += text;
			process.stderr.write(text.replace(/^/gm, `[${name}] `));
		});
		child.on("error", fail);
		child.on("close", (code) =>
			code === 0 ? ok(out) : fail(new Error(`${name} side exited with code ${code}`)),
		);
	});
}

const selected: SideName[] =
	values.side === "both" ? ["remotion", "motio"] : [values.side as SideName];
for (const s of selected) {
	if (!(s in sides)) throw new Error(`--side must be both, motio or remotion, got ${values.side}`);
}

const samples: Sample[] = [];
let remotionEnv: Record<string, string> = {};
for (let round = 0; round < Number(values.rounds); round++) {
	// Alternate the order so slow drift on the machine does not favour one side.
	const order = round % 2 === 0 ? selected : [...selected].reverse();
	for (const side of order) {
		const out = await runSide(side);
		samples.push(...parseSamples(out));
		for (const line of out.split("\n")) {
			if (line.startsWith('{"env"'))
				remotionEnv = (JSON.parse(line) as { env: typeof remotionEnv }).env;
		}
	}
}

const ffmpeg = await probeFfmpeg(process.env.MOTIO_FFMPEG ?? "ffmpeg");
const env = {
	date: new Date().toISOString(),
	machine: `${cpus()[0]?.model ?? "unknown CPU"}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)} GiB`,
	os: `${platform()} ${release()} ${arch()}`,
	node: process.version,
	motio: {
		chrome: `chrome-headless-shell ${CHROME_VERSION}`,
		ffmpeg: ffmpeg.version,
		captureMethod: process.env.MOTIO_CAPTURE_METHOD ?? "auto",
		options: JSON.parse(values.options) as unknown,
	},
	remotion: remotionEnv,
	workload: `${values.compositions} at scale ${values.scale}, ${values.frames} frames each, h264 CRF 18, muted; median of ${Number(values.rounds) * Number(values.runs)} runs`,
};
const rows = compare(samples);
console.log(JSON.stringify(env, null, 2));
console.log(formatTable(rows));
if (values.json)
	writeFileSync(values.json, `${JSON.stringify({ env, rows, samples }, null, "\t")}\n`);
if (values.assert) {
	const failures = criterionFailures(rows);
	if (failures.length > 0) {
		console.error(`Motio is slower than Remotion at concurrency ${failures.join(", ")}.`);
		process.exit(1);
	}
}
