// Motio side of the throughput benchmark (ROADMAP, Performance): bundles fixtures/compositions
// with the workspace packages and renders the benchmark compositions, printing one JSON line per
// render. Same arguments as tools/oracle-render/bench.ts, plus --options, a JSON object merged
// into the renderMedia options, to measure a variant (for example '{"x264Preset":"veryfast"}').
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createBundle } from "@motiojs/bundler";
import { type RenderMediaOptions, renderMedia, selectComposition } from "@motiojs/renderer";

const { values } = parseArgs({
	options: {
		compositions: { type: "string", default: "motion,timeline" },
		concurrency: { type: "string", default: "1,4,8" },
		runs: { type: "string", default: "3" },
		scale: { type: "string", default: "3" },
		frames: { type: "string", default: "60" },
		warmup: { type: "string", default: "1" },
		options: { type: "string", default: "{}" },
		out: { type: "string" },
	},
});

const fixture = resolve(import.meta.dirname, "../../fixtures/compositions");
const work = mkdtempSync(join(tmpdir(), "motio-bench-"));
const out = values.out ?? join(work, "out");
const ids = values.compositions.split(",");
const concurrencies = values.concurrency.split(",").map(Number);
const runs = Number(values.runs);
const scale = Number(values.scale);
const frameCount = Number(values.frames);
const extra = JSON.parse(values.options) as Partial<RenderMediaOptions>;
mkdirSync(out, { recursive: true });

try {
	const { serveUrl } = await createBundle({
		entryPoint: "src/index.ts",
		rootDir: fixture,
		outDir: join(work, "bundle"),
	});
	const compositions = new Map(
		await Promise.all(
			ids.map(
				async (id) => [id, await selectComposition({ serveUrl, id, inputProps: {} })] as const,
			),
		),
	);

	const render = async (id: string, concurrency: number): Promise<number> => {
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
			outputLocation: join(out, `motio-${id}-${concurrency}.mp4`),
			inputProps: {},
			...extra,
		});
		return performance.now() - start;
	};

	for (let i = 0; i < Number(values.warmup); i++) {
		await render(ids[0] as string, concurrencies[0] ?? 1);
	}
	for (let run = 0; run < runs; run++) {
		for (const concurrency of concurrencies) {
			for (const id of ids) {
				const ms = await render(id, concurrency);
				console.log(
					JSON.stringify({
						side: "motio",
						composition: id,
						concurrency,
						frames: frameCount,
						ms,
						...(values.options === "{}" ? {} : { variant: extra }),
					}),
				);
			}
		}
	}
} finally {
	rmSync(work, { recursive: true, force: true });
}
