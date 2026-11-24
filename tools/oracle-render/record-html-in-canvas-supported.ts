// Records what the published isHtmlInCanvasSupported() returns, in Node (no window) and in the page
// of a render (renderStill's browser, chromiumOptions.gl "swangle", as the M4 projects are recorded):
// a composition's calculateMetadata returns the value as a prop, read back with selectComposition.
// Public APIs only (clean room: never open files under node_modules).
// Writes packages/core/src/__oracle__/html-in-canvas-supported.json.
// Run: pnpm record:html-in-canvas-supported
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { selectComposition } from "@remotion/renderer";
import { isHtmlInCanvasSupported } from "remotion";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies
	.remotion as string;
const work = join(here, ".work-html-in-canvas");
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "src"), { recursive: true });
writeFileSync(
	join(work, "src/index.tsx"),
	`import { Composition, isHtmlInCanvasSupported, registerRoot } from "remotion";
const Empty = () => null;
registerRoot(() => (
	<Composition
		id="Probe"
		component={Empty}
		width={100}
		height={100}
		fps={30}
		durationInFrames={1}
		defaultProps={{ supported: null as boolean | null }}
		calculateMetadata={() => ({ props: { supported: isHtmlInCanvasSupported() } })}
	/>
));
`,
);
const serveUrl = await bundle({ entryPoint: join(work, "src/index.tsx") });
const chromiumOptions = { gl: "swangle" } as const;
const composition = await selectComposition({
	serveUrl,
	id: "Probe",
	inputProps: {},
	chromiumOptions,
});
const result = {
	remotion: version,
	node: isHtmlInCanvasSupported(),
	render: { gl: chromiumOptions.gl, supported: composition.props.supported },
};
const dir = join(root, "packages/core/src/__oracle__");
mkdirSync(dir, { recursive: true });
writeFileSync(
	join(dir, "html-in-canvas-supported.json"),
	`${JSON.stringify(result, null, "\t")}\n`,
);
rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(result));
