/**
 * Parsers for the benchmark data, with no Node imports so they also run in a browser bundle: the
 * landing page reads the files at build time (`landing-data.ts`), the promotional videos in
 * `promo/` import their text through Vite.
 */

export type PerfRow = { concurrency: number; baseline: number; motio: number };
export type PerfPlatform = { id: string; label: string; rows: PerfRow[]; note: string };

/** Version of Remotion pinned in the text of tools/oracle-render/package.json. */
export const parseBaselineVersion = (packageJson: string): string => {
	const pkg = JSON.parse(packageJson) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const version = { ...pkg.devDependencies, ...pkg.dependencies }.remotion;
	if (!version) throw new Error("tools/oracle-render/package.json does not pin remotion");
	return version;
};

/**
 * The performance table in the text of docs/ROADMAP.md: a header
 * `| Platform | Concurrency 1 | 4 | 8 |` and rows `| <platform>: Remotion / Motio | 6.54 / 1.75 s |
 * ... |`. Throws if the table changes shape, so no page shows stale or misparsed numbers.
 */
export const parsePerformanceTable = (roadmap: string, version: string): PerfPlatform[] => {
	const lines = roadmap.split("\n");
	const header = lines.findIndex((l) => /^\|\s*Platform\s*\|\s*Concurrency/.test(l));
	if (header === -1) throw new Error("docs/ROADMAP.md: performance table not found");
	const cells = (line: string) =>
		line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());
	const concurrency = cells(lines[header] ?? "")
		.slice(1)
		.map((c) => Number(/(\d+)$/.exec(c)?.[1]));
	const platforms: PerfPlatform[] = [];
	for (const line of lines.slice(header + 2)) {
		if (!line.startsWith("|")) break;
		const [name = "", ...values] = cells(line);
		const label = name.replace(/:\s*Remotion\s*\/\s*Motio\s*$/, "");
		if (label === name) throw new Error(`docs/ROADMAP.md: unexpected performance row "${name}"`);
		const rows = values.map((v, i) => {
			const m = /^([\d.]+)\s*\/\s*([\d.]+)\s*s$/.exec(v);
			const c = concurrency[i];
			if (!m || c === undefined || Number.isNaN(c)) {
				throw new Error(`docs/ROADMAP.md: cannot read "${v}" in row "${name}"`);
			}
			return { concurrency: c, baseline: Number(m[1]), motio: Number(m[2]) };
		});
		const linux = /linux/i.test(label);
		const where = linux
			? `in the pinned Linux image (${/linux-\w+/.exec(label)?.[0] ?? "linux"})`
			: `on ${label}`;
		platforms.push({
			id: linux ? "linux" : "macos",
			label: linux ? `Linux image, ${/linux-(\w+)/.exec(label)?.[1] ?? ""}` : label,
			rows,
			note: `Measured with make bench against Remotion ${version} ${where}, 1920x1080.`,
		});
	}
	if (platforms.length === 0) throw new Error("docs/ROADMAP.md: performance table has no rows");
	return platforms;
};
