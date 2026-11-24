// Child process of browser-exit.integration.test.ts: starts a long render on the fixture page,
// prints "rendering" once frames flow, then ends the way argv[4] says: a signal sent to itself
// (with no listener of its own, as a vitest worker or a plain script) or process.exit().
const [rendererEntry, serveUrl, how] = process.argv.slice(2);
const { renderMedia, selectComposition } = await import(rendererEntry);
const composition = await selectComposition({
	serveUrl,
	id: "stamp",
	inputProps: { durationInFrames: 3000 },
});
let announced = false;
await renderMedia({
	serveUrl,
	composition,
	codec: "h264",
	concurrency: 2,
	onProgress: ({ renderedFrames }) => {
		if (announced || renderedFrames < 5) return;
		announced = true;
		process.stdout.write("rendering\n");
		setTimeout(() => {
			if (how === "exit") process.exit(3);
			else process.kill(process.pid, how);
		}, 200);
	},
});
