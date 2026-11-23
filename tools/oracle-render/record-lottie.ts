// Records which animation frame the published @remotion/lottie shows at each composition frame:
// a probe composition renders <Lottie> over a grid of animations (frame rate, in and out points)
// and timing props, and logs lottie-web's `currentFrame` (from onAnimationLoaded's AnimationItem)
// for every frame rendered with renderFrames(). Public API only.
// Writes packages/lottie/src/__oracle__/timing.json. Run: pnpm record:lottie
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";

const here = import.meta.dirname;
const work = join(here, ".work-lottie-timing");
const out = resolve(here, "../../packages/lottie/src/__oracle__/timing.json");
const LAST_FRAME = 120;
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).dependencies[
	"@remotion/lottie"
] as string;

const ROOT = `
import { Lottie } from "@remotion/lottie";
import { useEffect, useMemo, useRef } from "react";
import { Composition, useCurrentFrame } from "remotion";

const make = (fr, ip, op) => ({
	v: "5.7.4", fr, ip, op, w: 100, h: 100, nm: "probe", ddd: 0, assets: [],
	layers: [{
		ddd: 0, ind: 1, ty: 4, nm: "square", sr: 1, ao: 0, ip, op, st: 0, bm: 0,
		ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
		shapes: [
			{ ty: "rc", d: 1, s: { a: 0, k: [20, 20] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 } },
			{ ty: "fl", c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 }, r: 1 },
		],
	}],
});

const Probe = ({ props, animation }) => {
	const frame = useCurrentFrame();
	const item = useRef(null);
	const data = useMemo(() => make(...animation), [animation]);
	// A parent's effect runs after its children's: lottie-web has been seeked by then.
	useEffect(() => {
		const i = item.current;
		console.log("PROBE " + JSON.stringify({ frame, current: i ? i.currentFrame : null, total: i ? i.totalFrames : null }));
	}, [frame]);
	return <Lottie {...props} animationData={data} onAnimationLoaded={(i) => { item.current = i; }} />;
};

export const Root = () => (
	<Composition id="probe" component={Probe} width={100} height={100} fps={30} durationInFrames={400}
		defaultProps={{ props: {}, animation: [25, 0, 50] }} />
);
`;

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "src"), { recursive: true });
writeFileSync(join(work, "src/Root.tsx"), ROOT);
writeFileSync(
	join(work, "src/index.ts"),
	'import { registerRoot } from "remotion";\nimport { Root } from "./Root";\nregisterRoot(Root);\n',
);

const animations: Array<[number, number, number]> = [
	[25, 0, 50],
	[30, 10, 40],
	[24, 0, 37.5],
];
const cases: Array<{ animation: [number, number, number]; props: Record<string, unknown> }> = [];
for (const animation of animations) {
	for (const playbackRate of [1, 0.7, 1.5, 3, 1 / 3]) {
		for (const loop of [false, true]) {
			for (const direction of ["forward", "backward"]) {
				cases.push({ animation, props: { loop, playbackRate, direction } });
			}
		}
	}
}

// <Sequence> props inherited by <Lottie>: trimBefore restarts the loop after the trimmed frames,
// freeze holds a frame.
for (const props of [
	{ loop: true, trimBefore: 30 },
	{ loop: true, trimBefore: 30, playbackRate: 0.7 },
	{ loop: true, trimBefore: 30, playbackRate: 2, direction: "backward" },
	{ trimBefore: 30, direction: "backward" },
	{ loop: true, trimBefore: 30, from: 5 },
	{ freeze: 20, loop: true },
	{ freeze: 100, loop: true },
	{ freeze: 40, trimBefore: 30 },
	{ freeze: 20, trimBefore: 30 },
]) {
	cases.push({ animation: [60, 0, 90], props });
}

const serveUrl = await bundle({ entryPoint: join(work, "src/index.ts") });
const results = [];
for (const inputProps of cases) {
	const composition = await selectComposition({ serveUrl, id: "probe", inputProps });
	const frames: Array<number | null> = new Array(LAST_FRAME + 1).fill(null);
	const from = (inputProps.props.from as number | undefined) ?? 0;
	let total: number | null = null;
	await renderFrames({
		composition,
		serveUrl,
		inputProps,
		imageFormat: "jpeg",
		outputDir: join(work, "frames"),
		frameRange: [0, LAST_FRAME],
		concurrency: 2,
		onStart: () => {},
		onFrameUpdate: () => {},
		onBrowserLog: (log) => {
			if (!log.text.startsWith("PROBE ")) return;
			const entry = JSON.parse(log.text.slice("PROBE ".length));
			frames[entry.frame] = entry.current;
			total = entry.total;
		},
	});
	// Before `from` the animation is not mounted.
	if (frames.slice(from).includes(null)) {
		throw new Error(`missing frames for ${JSON.stringify(inputProps)}`);
	}
	results.push({ ...inputProps, totalFrames: total, frames });
	console.log(`${JSON.stringify(inputProps)}: ${frames.length} frames`);
}

writeFileSync(
	out,
	`${JSON.stringify({
		package: "@remotion/lottie",
		version,
		description:
			"lottie-web's currentFrame (AnimationItem from onAnimationLoaded) at composition frames 0 to 120 of a 30 fps composition, per animation [fr, ip, op] and <Lottie> props (null: not mounted); totalFrames as lottie-web reports it",
		cases: results,
	})}\n`,
);
rmSync(work, { recursive: true, force: true });
console.log(`timing.json: ${results.length} cases`);
