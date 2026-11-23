import { bundle } from "@motiojs/bundler";
import { openBrowser, renderStill, selectComposition } from "@motiojs/renderer";

// region: open-browser
const serveUrl = await bundle({ entryPoint: "src/index.ts" });
const episodes = [
	{ slug: "episode-1", title: "Episode 1", subtitle: "Getting started" },
	{ slug: "episode-2", title: "Episode 2", subtitle: "Animation" },
	{ slug: "episode-3", title: "Episode 3", subtitle: "Rendering" },
];

// One Chrome for every render; each render opens and closes only its own tabs.
const browser = await openBrowser("chrome");
try {
	for (const { slug, ...inputProps } of episodes) {
		const composition = await selectComposition({
			serveUrl,
			id: "Thumbnail",
			inputProps,
			puppeteerInstance: browser,
		});
		await renderStill({
			serveUrl,
			composition,
			inputProps,
			output: `out/${slug}.png`,
			puppeteerInstance: browser,
		});
	}
} finally {
	await browser.close();
}
// endregion
