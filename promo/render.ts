/**
 * Renders all the promotional material into out/ with Motio's Node API: one bundle and one
 * browser session per output, every composition of src/Root.tsx. Then copies the stills the
 * repository uses to their places: the Open Graph card of the website and the README banner.
 *
 * Run with `make promo` from the repository root (it builds the packages first), or
 * `pnpm --dir promo render`.
 */
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@motiojs/bundler";
import { renderMedia, renderStill, selectComposition } from "@motiojs/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const out = join(here, "out");
mkdirSync(out, { recursive: true });

type Job =
	| { kind: "still"; id: string; file: string; scale?: number }
	| { kind: "video"; id: string; file: string }
	| { kind: "gif"; id: string; file: string };

const JOBS: Job[] = [
	{ kind: "still", id: "og-card", file: "og-card.png" },
	// Twice the size: GitHub shows the banner on high-density screens.
	{ kind: "still", id: "readme-banner", file: "readme-banner.png", scale: 2 },
	{ kind: "still", id: "square-post", file: "square-post.png" },
	{ kind: "video", id: "teaser", file: "teaser.mp4" },
	{ kind: "video", id: "teaser-vertical", file: "teaser-vertical.mp4" },
	{ kind: "gif", id: "mark-loop", file: "mark-loop.gif" },
];

/** Stills the repository commits, from out/ to their places. */
const PUBLISH: [from: string, to: string][] = [
	["og-card.png", "website/public/og/motio-card.png"],
	["readme-banner.png", "brand/motio-readme-banner.png"],
];

const only = process.argv.slice(2);
const started = performance.now();
const serveUrl = await bundle({ entryPoint: "src/index.ts", rootDir: here });

for (const job of JOBS) {
	if (only.length > 0 && !only.includes(job.id)) continue;
	const composition = await selectComposition({ serveUrl, id: job.id });
	const output = join(out, job.file);
	const t = performance.now();
	if (job.kind === "still") {
		await renderStill({
			serveUrl,
			composition,
			output,
			...(job.scale ? { scale: job.scale } : {}),
		});
	} else {
		await renderMedia({
			serveUrl,
			composition,
			codec: job.kind === "gif" ? "gif" : "h264",
			outputLocation: output,
			// 15 fps is plenty for the logo loop and halves the GIF.
			...(job.kind === "gif" ? { everyNthFrame: 2 } : { crf: 18 }),
			onProgress: ({ progress }) =>
				process.stderr.write(`\r${job.id}: ${Math.round(progress * 100)}%`),
		});
		process.stderr.write("\n");
	}
	const kb = Math.round(statSync(output).size / 1024);
	console.log(`${relative(repo, output)}  ${kb} KB  ${Math.round(performance.now() - t)} ms`);
}

for (const [from, to] of PUBLISH) {
	if (only.length > 0 && !only.some((id) => from.startsWith(id))) continue;
	copyFileSync(join(out, from), join(repo, to));
	console.log(`copied ${relative(repo, join(out, from))} to ${to}`);
}
console.log(`Done in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
