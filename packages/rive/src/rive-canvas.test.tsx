// @vitest-environment jsdom
// <RemotionRiveCanvas> in a simulated DOM over a fake Rive runtime (jsdom runs neither WebAssembly
// nor a 2D canvas): readiness while loading, onLoad, how each frame seeks and draws, the canvas
// markup recorded from the published package (__oracle__/rive.json), and the failures. The real
// runtime is covered in Chrome by oracle.integration.test.ts and golden.integration.test.ts.
import { CompositionFrame, RemotionEnvironmentContext, readiness } from "@motiojs/core/internals";
import { act, Component, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import oracle from "./__oracle__/rive.json" with { type: "json" };
import { RemotionRiveCanvas, type RiveCanvasRef } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const log: string[] = [];

interface FakeAnimation {
	name: string;
	start: number;
}

class FakeArtboard {
	bounds = { minX: 0, minY: 0, maxX: 1920, maxY: 1080 };
	constructor(readonly name: string) {}
	animationByIndex(i: number): FakeAnimation | null {
		return i === 0
			? { name: "bounce", start: 0 }
			: i === 2
				? { name: "curves", start: 1.25 }
				: null;
	}
	animationByName(name: string): FakeAnimation | null {
		return name === "idle" ? { name, start: 0 } : null;
	}
	advance(seconds: number) {
		log.push(`artboard.advance ${seconds.toFixed(4)}`);
	}
	draw() {
		log.push("draw");
	}
	delete() {
		log.push(`artboard.delete ${this.name}`);
	}
}

class FakeInstance {
	time: number;
	constructor(readonly animation: FakeAnimation | null) {
		this.time = animation ? animation.start : Number.NaN;
	}
	advance(seconds: number) {
		log.push(`advance ${seconds.toFixed(4)} from ${this.time}`);
		this.time += seconds;
		return true;
	}
	apply() {}
	delete() {}
}

const file = {
	defaultArtboard: () => new FakeArtboard("Truck"),
	artboardByIndex: (i: number) => (i === 0 ? new FakeArtboard("Truck") : null),
	artboardByName: (name: string) => (name === "Truck" ? new FakeArtboard(name) : null),
	artboardCount: () => 1,
	unref: () => log.push("file.unref"),
};

const runtime = {
	Fit: { contain: 1, cover: 2, fill: 0, fitWidth: 3, fitHeight: 4, none: 5, scaleDown: 6 },
	Alignment: { center: "center", topLeft: "topLeft", bottomRight: "bottomRight" },
	LinearAnimationInstance: FakeInstance,
	CustomFileAssetLoader: class {
		constructor(readonly options: { loadContents: (a: unknown, b: Uint8Array) => boolean }) {}
	},
	load: vi.fn(async (_bytes: Uint8Array, _loader: unknown, _cdn: boolean) => file as unknown),
	makeRenderer: () => ({
		clear: () => log.push("clear"),
		save: () => log.push("save"),
		restore: () => log.push("restore"),
		align: (fit: unknown, alignment: unknown, frame: unknown, content: unknown) =>
			log.push(`align ${JSON.stringify([fit, alignment, frame, content])}`),
		delete: () => {},
	}),
	resolveAnimationFrame: () => log.push("resolve"),
};

vi.mock("./runtime.js", () => ({ loadRiveRuntime: async () => runtime }));

const CONFIG = {
	id: "test",
	width: 400,
	height: 300,
	fps: 30,
	durationInFrames: 300,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

let current: ReactNode = null;
const Content = () => <>{current}</>;

/** Keeps what the tree threw, as a composition's error boundary does. */
class Boundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }> {
	override state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	override componentDidCatch(error: unknown) {
		this.props.onError(error);
	}
	override render() {
		return this.state.failed ? null : this.props.children;
	}
}

function mount(node: ReactNode, frame: number, rendering = true) {
	current = node;
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
	let error: unknown = null;
	const env = {
		isStudio: false,
		isRendering: rendering,
		isPlayer: !rendering,
		isReadOnlyStudio: false,
		isClientSideRendering: false,
	};
	const draw = (f: number) =>
		act(() => {
			root ??= createRoot(container);
			root.render(
				<Boundary
					onError={(e) => {
						error = e;
					}}
				>
					<RemotionEnvironmentContext.Provider value={env}>
						<CompositionFrame component={Content} config={CONFIG} frame={f} />
					</RemotionEnvironmentContext.Provider>
				</Boundary>,
			);
		});
	draw(frame);
	return {
		container,
		at: draw,
		error: () => error,
		unmount: () => {
			act(() => root?.unmount());
			container.remove();
		},
	};
}

/** Lets the stubbed fetch and load settle. */
const settle = () =>
	act(async () => {
		for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	});

const recordedHtml = (props: Record<string, unknown>, frame?: number) =>
	oracle.markup.find(
		(m) =>
			JSON.stringify(m.props) === JSON.stringify(props) &&
			(m as { frame?: number }).frame === frame,
	)?.html;

beforeEach(() => {
	log.length = 0;
	vi.stubGlobal("fetch", async () => new Response(new Uint8Array([82, 73, 86, 69])));
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	readiness.reset();
});

describe("RemotionRiveCanvas", () => {
	it("holds readiness until the file is loaded and drawn, then calls onLoad once", async () => {
		const loads: unknown[] = [];
		const ref = createRef<RiveCanvasRef>();
		const view = mount(
			<RemotionRiveCanvas src="/truck.riv" ref={ref} onLoad={(f) => loads.push(f)} />,
			0,
		);
		expect(readiness.openHandles().map((h) => h.label)).toEqual([
			"Loading the Rive animation /truck.riv",
		]);
		expect(ref.current?.getArtboard()).toBeNull();
		await settle();
		expect(readiness.openHandles()).toEqual([]);
		expect(loads).toEqual([file]);
		expect(ref.current?.getCanvas()).toBe(runtime);
		expect((ref.current?.getArtboard() as unknown as FakeArtboard | null)?.name).toBe("Truck");
		expect(ref.current?.getAnimationInstance()).toBeInstanceOf(FakeInstance);
		expect(ref.current?.getRenderer()).not.toBeNull();
		view.at(1);
		expect(loads).toHaveLength(1);
		view.unmount();
		expect(log).toContain("file.unref");
	});

	it("seeks from the start to frame / fps every frame, whatever the order", async () => {
		const view = mount(<RemotionRiveCanvas src="/truck.riv" animation={2} />, 45);
		await settle();
		log.length = 0;
		for (const frame of [15, 90, 0]) view.at(frame);
		const advances = log.filter((l) => l.startsWith("advance"));
		// The work area starts at 1.25 s: every seek goes back there first.
		expect(advances).toEqual([
			"advance 0.5000 from 1.25",
			"advance 3.0000 from 1.25",
			"advance 0.0000 from 1.25",
		]);
		// The artboard's own clock moves by the time since the frame drawn last.
		expect(log.filter((l) => l.startsWith("artboard.advance"))).toEqual([
			"artboard.advance -1.0000",
			"artboard.advance 2.5000",
			"artboard.advance -3.0000",
		]);
		view.unmount();
	});

	it("draws the artboard into the canvas with fit and alignment, then flushes", async () => {
		const view = mount(<RemotionRiveCanvas src="/truck.riv" fit="cover" alignment="top-left" />, 0);
		await settle();
		const draw = log.slice(log.indexOf("clear"));
		expect(draw.slice(0, 6)).toEqual([
			"clear",
			"save",
			`align ${JSON.stringify([2, "topLeft", { minX: 0, minY: 0, maxX: 400, maxY: 300 }, { minX: 0, minY: 0, maxX: 1920, maxY: 1080 }])}`,
			"draw",
			"restore",
			"resolve",
		]);
		view.unmount();
	});

	it("renders the canvas markup the published package renders", async () => {
		for (const [props, frame] of [
			[{}, undefined],
			[{ className: "r", style: { opacity: 0.5, width: 200 } }, undefined],
			[{ cropLeft: 0.1, cropBottom: 0.2 }, undefined],
			[{ from: 5, premountFor: 5 }, 2],
			[
				{
					from: 5,
					premountFor: 5,
					style: { opacity: 0.5 },
					styleWhilePremounted: { opacity: 0.2, display: "block" },
				},
				2,
			],
			[{ durationInFrames: 5, postmountFor: 5 }, 7],
		] as Array<[Record<string, unknown>, number | undefined]>) {
			const view = mount(<RemotionRiveCanvas src="/truck.riv" {...props} />, frame ?? 0, false);
			await settle();
			expect(view.container.innerHTML, JSON.stringify(props)).toBe(recordedHtml(props, frame));
			view.unmount();
		}
	});

	it("renders nothing when hidden or before from", async () => {
		const hidden = mount(<RemotionRiveCanvas src="/truck.riv" hidden />, 0);
		const early = mount(<RemotionRiveCanvas src="/truck.riv" from={5} />, 2);
		await settle();
		expect(hidden.container.innerHTML).toBe("");
		expect(early.container.innerHTML).toBe("");
		hidden.unmount();
		early.unmount();
	});

	it("passes a custom asset loader and the CDN flag to the runtime", async () => {
		const assetLoader = vi.fn(() => true);
		const view = mount(
			<RemotionRiveCanvas src="/truck.riv" assetLoader={assetLoader} enableRiveAssetCdn={false} />,
			0,
		);
		await settle();
		const [, loader, cdn] = runtime.load.mock.calls.at(-1) as [
			Uint8Array,
			{ options: { loadContents: (a: unknown, b: Uint8Array) => boolean } },
			boolean,
		];
		expect(cdn).toBe(false);
		expect(loader.options.loadContents({ name: "a" }, new Uint8Array())).toBe(true);
		expect(assetLoader).toHaveBeenCalledWith({ name: "a" }, new Uint8Array());
		view.unmount();
	});

	it("throws a TypeError naming the artboards when the artboard does not exist, before onLoad", async () => {
		const onLoad = vi.fn();
		const view = mount(<RemotionRiveCanvas src="/truck.riv" artboard="nope" onLoad={onLoad} />, 0);
		await settle();
		expect(view.error()).toBeInstanceOf(TypeError);
		expect(String(view.error())).toMatch(/no artboard "nope"\. Its artboards: "Truck"/);
		expect(onLoad).not.toHaveBeenCalled();
		view.unmount();
	});

	it("throws a TypeError when the file cannot be downloaded or read", async () => {
		vi.stubGlobal("fetch", async () => new Response("Not Found", { status: 404 }));
		const missing = mount(<RemotionRiveCanvas src="/missing.riv" />, 0);
		await settle();
		expect(missing.error()).toBeInstanceOf(TypeError);
		expect(String(missing.error())).toMatch(/\/missing\.riv.*404/);
		missing.unmount();

		vi.stubGlobal("fetch", async () => new Response("text"));
		runtime.load.mockResolvedValueOnce(null);
		const unreadable = mount(<RemotionRiveCanvas src="/text.riv" />, 0);
		await settle();
		expect(unreadable.error()).toBeInstanceOf(TypeError);
		expect(String(unreadable.error())).toMatch(/\/text\.riv is not a Rive file/);
		unreadable.unmount();
	});

	it("throws an Error for an unknown fit or alignment once loaded", async () => {
		for (const [props, pattern] of [
			[{ fit: "nope" }, /fit is "nope"; use one of "contain", "cover"/],
			[{ alignment: "nope" }, /alignment is "nope"; use one of "center"/],
		] as const) {
			const onLoad = vi.fn();
			const view = mount(
				<RemotionRiveCanvas src="/truck.riv" {...(props as object)} onLoad={onLoad} />,
				0,
			);
			await settle();
			expect(view.error()).toBeInstanceOf(Error);
			expect(String(view.error())).toMatch(pattern);
			expect(onLoad).toHaveBeenCalledTimes(1);
			view.unmount();
		}
	});

	it("rejects effects, which need @remotion/effects", () => {
		const view = mount(<RemotionRiveCanvas src="/truck.riv" effects={[{}]} />, 0);
		expect(String(view.error())).toMatch(/effects prop needs @remotion\/effects/);
		view.unmount();
		const empty = mount(<RemotionRiveCanvas src="/truck.riv" effects={[]} />, 0);
		expect(empty.error()).toBeNull();
		empty.unmount();
	});
});
