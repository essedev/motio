// Records outputs of the published @remotion/paths, @remotion/shapes,
// @remotion/noise and @remotion/captions packages as JSON fixtures for the
// matching Motio packages. Only public APIs are called.
//
// Usage: pnpm install && pnpm record [paths|shapes|noise|captions ...]

import { recordNoise } from "./record-noise.mjs";

const recorders = {
	noise: recordNoise,
};

const selected = process.argv.slice(2);
for (const name of selected.length > 0 ? selected : Object.keys(recorders)) {
	const recorder = recorders[name];
	if (recorder === undefined) throw new Error(`unknown recorder ${name}`);
	await recorder();
}
