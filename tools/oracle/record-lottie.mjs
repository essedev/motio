// Records what the published @remotion/lottie does without a browser: the markup <Lottie> renders
// inside @remotion/player's <Thumbnail> (server-rendered, so before lottie-web fills it), the
// messages of invalid props (rendered in jsdom), and getLottieMetadata() over a grid of inputs.
// Writes packages/lottie/src/__oracle__/lottie.json. Public API only.
//
// Usage: pnpm record:lottie
// Standalone (not part of record.mjs): lottie-web probes the DOM when it is imported, so jsdom is
// installed first, with a no-op 2D context (jsdom has no canvas).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const here = import.meta.dirname;
const outDir = join(here, "../../packages/lottie/src/__oracle__");

const dom = new JSDOM("<!doctype html>", { pretendToBeVisual: true });
for (const key of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLCanvasElement",
	"Element",
	"Node",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
]) {
	Object.defineProperty(globalThis, key, {
		value: key === "window" ? dom.window : dom.window[key],
		configurable: true,
		writable: true,
	});
}
const context = new Proxy(
	{},
	{
		get: (target, key) => (key in target ? target[key] : () => ({ data: [] })),
		set: (target, key, value) => {
			target[key] = value;
			return true;
		},
	},
);
dom.window.HTMLCanvasElement.prototype.getContext = () => context;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { getLottieMetadata, Lottie } = await import("@remotion/lottie");
const { Thumbnail } = await import("@remotion/player");
const { act, createElement: h } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");

// JSON cannot hold undefined, NaN or the infinities: tagged as { $u } and { $n }.
const tag = (value) => {
	if (value === undefined) return { $u: true };
	if (typeof value === "number" && !Number.isFinite(value)) return { $n: String(value) };
	if (Array.isArray(value)) return value.map(tag);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tag(v)]));
	}
	return value;
};

const DATA = { v: "5.7.4", fr: 25, ip: 0, op: 50, w: 100, h: 100, layers: [] };
const thumbnail = (props, frame, onError) =>
	h(Thumbnail, {
		component: () => h(Lottie, props),
		durationInFrames: 30,
		compositionWidth: 100,
		compositionHeight: 100,
		fps: 30,
		frameToDisplay: frame,
		...(onError
			? {
					errorFallback: ({ error }) => {
						onError(error);
						return null;
					},
				}
			: {}),
	});

/** The markup inside the Thumbnail's own wrappers. */
const inner = (markup) =>
	markup.replace(/^.*?class="__remotion-player">/, "").replace(/<\/div><\/div><\/div>$/, "");

// Props besides animationData, rendered at the listed frames.
const MARKUP = [
	[{}, [0, 3]],
	[{ style: { width: 10, backgroundColor: "red" }, className: "a b" }, [0]],
	[{ renderer: "canvas", preserveAspectRatio: "xMinYMin slice", assetsPath: "/x/" }, [0]],
	[{ loop: true, direction: "backward", playbackRate: 2 }, [0, 5]],
	[{ from: 2 }, [0, 1, 2, 5]],
	[{ from: 2, durationInFrames: 3 }, [4, 5]],
	[{ trimBefore: 4 }, [0]],
	[{ freeze: 3 }, [0]],
	[{ hidden: true }, [0]],
	[{ name: "n", showInTimeline: true, from: 1 }, [2]],
	[{ from: 5, premountFor: 3 }, [1, 2, 3, 5]],
	[{ from: 5, premountFor: 3, style: { opacity: 0.5, color: "red" } }, [3]],
	[{ from: 5, premountFor: 3, styleWhilePremounted: { opacity: 0.3, display: "block" } }, [3]],
	[{ durationInFrames: 5, postmountFor: 3 }, [4, 5, 7, 8]],
	[
		{
			durationInFrames: 5,
			postmountFor: 3,
			style: { width: 3 },
			styleWhilePostmounted: { pointerEvents: "auto" },
		},
		[6],
	],
];

const INVALID = [
	{ animationData: undefined },
	{ animationData: null },
	{ animationData: "x" },
	{ animationData: 5 },
	{ animationData: [] },
	{ playbackRate: 0 },
	{ playbackRate: -0 },
	{ playbackRate: -1 },
	{ playbackRate: 1e-9 },
	{ playbackRate: Number.POSITIVE_INFINITY },
	{ playbackRate: Number.NEGATIVE_INFINITY },
	{ playbackRate: Number.NaN },
	{ playbackRate: "2" },
	{ playbackRate: null },
	{ playbackRate: true },
	{ loop: "yes" },
	{ loop: 1 },
	{ loop: 0 },
	{ loop: null },
	{ direction: "up" },
	{ direction: 1 },
	{ direction: null },
	{ animationData: null, playbackRate: -1, loop: "x" },
	{ playbackRate: -1, loop: "x" },
	{ playbackRate: "x", loop: "x" },
];

const recordMarkup = () => {
	const cases = [];
	for (const [props, frames] of MARKUP) {
		for (const frame of frames) {
			const markup = inner(
				renderToStaticMarkup(thumbnail({ animationData: DATA, ...props }, frame, null)),
			);
			cases.push({ props: tag(props), frame, markup });
		}
	}
	return cases;
};

/** Renders each invalid case in jsdom and collects the thrown messages. */
const recordErrors = async () => {
	const quiet = console.error;
	console.error = () => {};
	const cases = [];
	for (const props of INVALID) {
		let error = null;
		const node = dom.window.document.createElement("div");
		const root = createRoot(node);
		await act(async () => {
			root.render(
				thumbnail({ animationData: DATA, ...props }, 3, (e) => {
					error = `${e.name}: ${e.message}`;
				}),
			);
		});
		await act(async () => root.unmount());
		cases.push({ props: tag(props), error });
	}
	console.error = quiet;
	return cases;
};

// getLottieMetadata(): every single-field variation of a valid animation, then a random grid.
const POOL = [undefined, null, 0, -0, 1, 30, 29.97, 90.5, -5, "30", "", Number.NaN, true, []];
const BASE = { fr: 30, ip: 0, op: 90, w: 1920, h: 1080 };
const recordMetadata = () => {
	let seed = 42;
	const rng = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const inputs = [BASE, {}, { fr: 29.9700012207031, ip: 0, op: 90, w: 1920, h: 1080 }];
	for (const key of Object.keys(BASE)) {
		for (const value of POOL) {
			const input = { ...BASE };
			if (value === undefined) delete input[key];
			else input[key] = value;
			inputs.push(input);
		}
	}
	for (let i = 0; i < 400; i++) {
		const input = {};
		for (const key of Object.keys(BASE)) {
			const value = rng() < 0.5 ? BASE[key] : POOL[Math.floor(rng() * POOL.length)];
			if (value !== undefined) input[key] = value;
		}
		if (rng() < 0.3) input.ip = Math.round(rng() * 40 * 100) / 100;
		if (rng() < 0.3) input.op = Math.round(rng() * 400 * 100) / 100;
		if (rng() < 0.3) input.fr = Math.round(rng() * 120 * 1000) / 1000;
		inputs.push(input);
	}
	const cases = [];
	for (const input of [...inputs, null, undefined, "x", 5]) {
		try {
			cases.push({ input: tag(input), out: tag(getLottieMetadata(input)) });
		} catch (e) {
			cases.push({ input: tag(input), error: `${e.name}: ${e.message}` });
		}
	}
	return cases;
};

const metadata = recordMetadata();
const markup = recordMarkup();
const errors = await recordErrors();
const version = JSON.parse(
	readFileSync(join(here, "node_modules/@remotion/lottie/package.json"), "utf8"),
).version;
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "lottie.json"),
	`${JSON.stringify({
		package: "@remotion/lottie",
		version,
		description:
			"Server-rendered markup of <Lottie> in a 30-frame Thumbnail (animationData is a 25 fps, 50-frame animation), messages of invalid props rendered in jsdom, getLottieMetadata() outputs. undefined is tagged { $u }, non-finite numbers { $n }.",
		data: DATA,
		markup,
		errors,
		metadata,
	})}\n`,
);
console.log(
	`lottie.json: ${markup.length} markup, ${errors.length} errors, ${metadata.length} metadata cases`,
);
process.exit(0);
