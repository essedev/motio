// Records outputs of the published @remotion/paths, @remotion/shapes,
// @remotion/noise, @remotion/captions and @remotion/animation-utils packages as JSON fixtures for the
// matching Motio packages. Only public APIs are called.
//
// Usage: pnpm install && pnpm record [paths|shapes|noise|captions ...]

import { recordAnimationUtils } from "./record-animation-utils.mjs";
import { recordCaptions } from "./record-captions.mjs";
import { recordNoise } from "./record-noise.mjs";
import { recordPaths } from "./record-paths.mjs";
import { recordShapes } from "./record-shapes.mjs";

const recorders = {
	"animation-utils": recordAnimationUtils,
	captions: recordCaptions,
	noise: recordNoise,
	paths: recordPaths,
	shapes: recordShapes,
};

const selected = process.argv.slice(2);
for (const name of selected.length > 0 ? selected : Object.keys(recorders)) {
	const recorder = recorders[name];
	if (recorder === undefined) throw new Error(`unknown recorder ${name}`);
	await recorder();
}
