// Records outputs of the published @remotion/paths, @remotion/shapes,
// @remotion/noise, @remotion/captions, @remotion/animation-utils and @remotion/rounded-text-box packages as JSON fixtures for the
// matching Motio packages. Only public APIs are called.
//
// Usage: pnpm install && pnpm record [paths|shapes|noise|captions|rounded-text-box ...]

import { recordAnimationUtils } from "./record-animation-utils.mjs";
import { recordCaptions } from "./record-captions.mjs";
import { recordNoise } from "./record-noise.mjs";
import { recordPaths } from "./record-paths.mjs";
import { recordRoundedTextBox } from "./record-rounded-text-box.mjs";
import { recordShapes } from "./record-shapes.mjs";

const recorders = {
	"animation-utils": recordAnimationUtils,
	captions: recordCaptions,
	noise: recordNoise,
	paths: recordPaths,
	"rounded-text-box": recordRoundedTextBox,
	shapes: recordShapes,
};

const selected = process.argv.slice(2);
for (const name of selected.length > 0 ? selected : Object.keys(recorders)) {
	const recorder = recorders[name];
	if (recorder === undefined) throw new Error(`unknown recorder ${name}`);
	await recorder();
}
