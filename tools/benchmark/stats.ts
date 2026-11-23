// Pure helpers of the throughput benchmark: medians, the summary table and the criterion check.
// Kept free of I/O so they are unit tested (stats.test.ts).

/** Which renderer produced a sample. */
export type Side = "remotion" | "motio";

/** One timed render, as printed (one JSON line) by each side's script. */
export interface Sample {
	side: Side;
	composition: string;
	concurrency: number;
	frames: number;
	/** Wall time of the render call, browser start and encoding included. */
	ms: number;
}

/** Median wall time of one side at one concurrency, summed over the compositions. */
export interface CaseSummary {
	concurrency: number;
	/** Median per composition, in milliseconds. */
	byComposition: Record<string, number>;
	/** Sum of the medians of every composition, in milliseconds. */
	totalMs: number;
	/** Frames of every composition divided by `totalMs`. */
	fps: number;
	/** Samples behind each median (the smallest count over the compositions). */
	runs: number;
}

/** Median of a non-empty list (mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
	if (values.length === 0) throw new RangeError("median of an empty list");
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Summarises the samples of one side, one row per concurrency, ascending. */
export function summarise(samples: readonly Sample[], side: Side): CaseSummary[] {
	const mine = samples.filter((s) => s.side === side);
	const concurrencies = [...new Set(mine.map((s) => s.concurrency))].sort((a, b) => a - b);
	return concurrencies.map((concurrency) => {
		const atC = mine.filter((s) => s.concurrency === concurrency);
		const compositions = [...new Set(atC.map((s) => s.composition))].sort();
		const byComposition: Record<string, number> = {};
		let totalMs = 0;
		let frames = 0;
		let runs = Number.POSITIVE_INFINITY;
		for (const c of compositions) {
			const list = atC.filter((s) => s.composition === c);
			const m = median(list.map((s) => s.ms));
			byComposition[c] = m;
			totalMs += m;
			frames += list[0]?.frames ?? 0;
			runs = Math.min(runs, list.length);
		}
		return { concurrency, byComposition, totalMs, fps: frames / (totalMs / 1000), runs };
	});
}

/** One row of the comparison: both sides at one concurrency. */
export interface Comparison {
	concurrency: number;
	remotion: CaseSummary | undefined;
	motio: CaseSummary | undefined;
	/** Motio's wall time over Remotion's; below or at 1 meets the criterion. */
	ratio: number | null;
}

/** Pairs the summaries of both sides by concurrency. */
export function compare(samples: readonly Sample[]): Comparison[] {
	const remotion = summarise(samples, "remotion");
	const motio = summarise(samples, "motio");
	const concurrencies = [...new Set([...remotion, ...motio].map((s) => s.concurrency))].sort(
		(a, b) => a - b,
	);
	return concurrencies.map((concurrency) => {
		const r = remotion.find((s) => s.concurrency === concurrency);
		const m = motio.find((s) => s.concurrency === concurrency);
		return { concurrency, remotion: r, motio: m, ratio: r && m ? m.totalMs / r.totalMs : null };
	});
}

/** The concurrencies at which Motio is slower than Remotion (or a side is missing). */
export function criterionFailures(rows: readonly Comparison[]): number[] {
	return rows.filter((r) => r.ratio === null || r.ratio > 1).map((r) => r.concurrency);
}

const seconds = (ms: number | undefined) =>
	ms === undefined ? "-" : `${(ms / 1000).toFixed(2)} s`;

/** A Markdown table of the comparison, as recorded in DECISIONS and the ROADMAP. */
export function formatTable(rows: readonly Comparison[]): string {
	const lines = [
		"| Concurrency | Remotion | Motio | Remotion fps | Motio fps | Motio / Remotion |",
		"|---|---|---|---|---|---|",
	];
	for (const r of rows) {
		lines.push(
			`| ${r.concurrency} | ${seconds(r.remotion?.totalMs)} | ${seconds(r.motio?.totalMs)} | ${
				r.remotion ? r.remotion.fps.toFixed(1) : "-"
			} | ${r.motio ? r.motio.fps.toFixed(1) : "-"} | ${r.ratio === null ? "-" : r.ratio.toFixed(2)} |`,
		);
	}
	return lines.join("\n");
}

/** Parses the JSON lines a side printed; other lines (logs) are ignored. */
export function parseSamples(output: string): Sample[] {
	const samples: Sample[] = [];
	for (const line of output.split("\n")) {
		const t = line.trim();
		if (!t.startsWith("{")) continue;
		let v: unknown;
		try {
			v = JSON.parse(t);
		} catch {
			continue;
		}
		if (isSample(v)) samples.push(v);
	}
	return samples;
}

function isSample(v: unknown): v is Sample {
	if (typeof v !== "object" || v === null) return false;
	const s = v as Record<string, unknown>;
	return (
		(s.side === "remotion" || s.side === "motio") &&
		typeof s.composition === "string" &&
		typeof s.concurrency === "number" &&
		typeof s.frames === "number" &&
		typeof s.ms === "number"
	);
}
