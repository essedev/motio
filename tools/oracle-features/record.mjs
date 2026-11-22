// Records outputs of the published @remotion/paths, @remotion/shapes,
// @remotion/noise and @remotion/captions packages as JSON fixtures for the
// matching Motio packages. Only public APIs are called.
//
// Usage: pnpm install && pnpm record [paths|shapes|noise|captions ...]

import { recordCaptions } from "./record-captions.mjs";
import { recordNoise } from "./record-noise.mjs";
import { recordPaths } from "./record-paths.mjs";

const recorders = {
	captions: recordCaptions,
	noise: recordNoise,
	paths: recordPaths,
};

const selected = process.argv.slice(2);
for (const name of selected.length > 0 ? selected : Object.keys(recorders)) {
	const recorder = recorders[name];
	if (recorder === undefined) throw new Error(`unknown recorder ${name}`);
	await recorder();
}
