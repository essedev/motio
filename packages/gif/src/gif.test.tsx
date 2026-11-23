// @vitest-environment jsdom
// <Gif> in a simulated DOM: readiness while loading, the onLoad payload, onError and the thrown
// error with the published package's messages (__oracle__/gif.json), unmount-after-finish, the
// premount and crop styles, and prop validation. jsdom has no 2D canvas, so drawing is covered by
// the golden test (golden.integration.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CompositionFrame, RemotionEnvironmentContext, readiness } from "@motiojs/core/internals";
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import oracle from "./__oracle__/gif.json" with { type: "json" };
import { Gif, type GifLoadInfo } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counter = readFileSync(join(import.meta.dirname, "../../../fixtures/gif/public/counter.gif"));

const CONFIG = {
	id: "test",
	width: 480,
	height: 270,
	fps: 30,
	durationInFrames: 120,
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

function mount(node: ReactNode, frame: number, rendering = true) {
	current = node;
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
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
				<RemotionEnvironmentContext.Provider value={env}>
					<CompositionFrame component={Content} config={CONFIG} frame={f} />
				</RemotionEnvironmentContext.Provider>,
			);
		});
	draw(frame);
	return {
		container,
		at: draw,
		unmount: () => {
			act(() => root?.unmount());
			container.remove();
		},
	};
}

/** Lets the stubbed fetch and the decode settle. */
const settle = () =>
	act(async () => {
		for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	});

const gifResponse = () => new Response(counter, { headers: { "content-type": "image/gif" } });

beforeAll(() => {
	// jsdom has no ImageData without the canvas package.
	if (typeof globalThis.ImageData === "undefined") {
		globalThis.ImageData = class {
			constructor(
				readonly data: Uint8ClampedArray,
				readonly width: number,
				readonly height: number,
			) {}
		} as unknown as typeof ImageData;
	}
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	readiness.reset();
});

describe("Gif", () => {
	it("holds readiness until loaded and reports the decoded GIF to onLoad", async () => {
		vi.stubGlobal("fetch", async () => gifResponse());
		const loads: GifLoadInfo[] = [];
		const ref = createRef<HTMLCanvasElement>();
		const view = mount(
			<Gif src="/c-load.gif" width={160} height={90} ref={ref} onLoad={(i) => loads.push(i)} />,
			0,
		);
		expect(readiness.openHandles().map((h) => h.label)).toEqual([
			"Loading <Gif> with src=/c-load.gif",
		]);
		await settle();
		expect(readiness.openHandles()).toEqual([]);
		const recorded = oracle.loads["/counter.gif"];
		expect(loads).toHaveLength(1);
		const [info] = loads as [GifLoadInfo];
		expect(Object.keys(info)).toEqual(recorded.keys);
		expect(info.delays).toEqual(recorded.delays);
		expect([info.width, info.height, info.loaded, info.frames.length]).toEqual([160, 90, true, 8]);
		expect(ref.current?.tagName).toBe("CANVAS");
		expect(view.container.innerHTML).toBe('<canvas width="160" height="90"></canvas>');
		view.unmount();
	});

	it("calls onError with the published message and keeps rendering", async () => {
		vi.stubGlobal("fetch", async () => new Response("Not Found", { status: 404 }));
		const errors: Error[] = [];
		const view = mount(<Gif src="/missing-1.gif" onError={(e) => errors.push(e)} />, 0);
		await settle();
		const recorded = (oracle.loads["/missing.gif"] as unknown as { error: string }).error;
		// The fixture server answered text/plain; Response() here sends text/plain;charset=UTF-8.
		expect(`${errors[0]?.name}: ${errors[0]?.message}`).toBe(
			recorded.replace('"text/plain"', '"text/plain;charset=UTF-8"'),
		);
		expect(readiness.openHandles()).toEqual([]);
		view.unmount();
	});

	it("throws the published message when loading fails without onError", async () => {
		vi.stubGlobal("fetch", async () => new Response(counter));
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const caught: unknown[] = [];
		window.addEventListener("error", (e) => caught.push(e.error));
		const view = mount(<Gif src="/no-type.gif" />, 0);
		let thrown: unknown;
		try {
			await settle();
		} catch (error) {
			thrown = error;
		}
		const error = (thrown ?? caught[0]) as Error;
		expect(error.message).toBe(
			'Failed to render GIF with source /no-type.gif: "Error: Wrong content type: "null"".',
		);
		spy.mockRestore();
		view.unmount();
	});

	it("unmounts the canvas after the last frame with unmount-after-finish", async () => {
		vi.stubGlobal("fetch", async () => gifResponse());
		const ref = createRef<HTMLCanvasElement>();
		const view = mount(
			<Gif
				src="/c-unmount.gif"
				width={10}
				height={10}
				loopBehavior="unmount-after-finish"
				ref={ref}
			/>,
			29,
		);
		await settle();
		expect(view.container.querySelector("canvas")).not.toBeNull();
		view.at(30);
		expect(view.container.querySelector("canvas")).toBeNull();
		expect(ref.current).toBeNull();
		view.unmount();
	});

	it("hides the canvas while premounted, and crops it with a clip path", async () => {
		vi.stubGlobal("fetch", async () => gifResponse());
		for (const c of (
			oracle.markup as Array<{ props: Record<string, unknown>; frame?: number; html: string }>
		).filter(
			(m) => "premountFor" in m.props || "postmountFor" in m.props || "cropLeft" in m.props,
		)) {
			const view = mount(<Gif src="/c-markup.gif" {...(c.props as object)} />, c.frame ?? 0, false);
			await settle();
			const ours = view.container.querySelector("canvas") as HTMLCanvasElement;
			const theirs = new DOMParser()
				.parseFromString(c.html, "text/html")
				.querySelector("canvas") as HTMLCanvasElement;
			expect(ours.getAttribute("style"), JSON.stringify(c.props)).toBe(
				theirs.getAttribute("style"),
			);
			view.unmount();
		}
	});

	it("drops props the canvas does not take", async () => {
		vi.stubGlobal("fetch", async () => gifResponse());
		const props = { className: "g", id: "x" } as object;
		const view = mount(<Gif src="/c-props.gif" width={120} height={80} {...props} />, 0);
		await settle();
		expect(view.container.innerHTML).toBe('<canvas width="120" height="80"></canvas>');
		view.unmount();
	});

	it("rejects invalid props with the published messages", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const c of oracle.invalid.filter((i) => "playbackRate" in i.props)) {
			let message: string | null = null;
			try {
				mount(<Gif src="/x.gif" {...(c.props as object)} />, 0).unmount();
			} catch (error) {
				message = `${(error as Error).name}: ${(error as Error).message}`;
			}
			expect(message, JSON.stringify(c.props)).toBe(c.error);
		}
		expect(() => mount(<Gif src="/x.gif" effects={[{}]} />, 0)).toThrow(/effects/);
		spy.mockRestore();
	});
});
