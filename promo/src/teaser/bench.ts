import roadmap from "../../../docs/ROADMAP.md?raw";
import oraclePackage from "../../../tools/oracle-render/package.json?raw";
import {
	type PerfPlatform,
	parseBaselineVersion,
	parsePerformanceTable,
} from "../../../website/src/lib/perf-table.ts";

// The benchmark as docs/ROADMAP.md records it, read with the same parser as the website, so the
// teaser cannot show numbers the repository does not have.
const platforms = parsePerformanceTable(roadmap, parseBaselineVersion(oraclePackage));

const find = (id: string): PerfPlatform => {
	const platform = platforms.find((p) => p.id === id);
	if (!platform) throw new Error(`docs/ROADMAP.md has no benchmark row for ${id}.`);
	return platform;
};

/** The macOS row, the one measured on the author's machine. */
export const BENCH = find("macos");

/** Version of the measured baseline, as tools/oracle-render pins it. */
export const BASELINE_VERSION = parseBaselineVersion(oraclePackage);

/** The largest speed-up of the row, rounded down to one decimal. */
export const BEST_SPEEDUP =
	Math.floor(Math.max(...BENCH.rows.map((r) => r.baseline / r.motio)) * 10) / 10;
