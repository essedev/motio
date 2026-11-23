// @vitest-environment jsdom
import { useCurrentFrame } from "@motiojs/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookFlip } from "../presentations/book-flip.js";
import { crossZoom } from "../presentations/cross-zoom.js";
import { dissolve, dissolveShader } from "../presentations/dissolve.js";
import { fade } from "../presentations/fade.js";
import { type Mounted, renderAtFrame } from "../testing/harness.js";
import { linearTiming } from "../timings/linear-timing.js";
import { TransitionSeries } from "../transition-series.js";
import type { TransitionPresentation } from "../types.js";
import {
	HTML_IN_CANVAS_EFFECTS_UNSUPPORTED,
	HtmlInCanvasEffectsUnsupportedError,
	type HtmlInCanvasShader,
	makeHtmlInCanvasPresentation,
} from "./make-html-in-canvas-presentation.js";
import { HtmlInCanvasRegistry } from "./registry.js";

// A stand-in for Chrome's HTML-in-canvas API: drawing an element records its text, copying a
// canvas copies that text, and requestPaint() fires `paint` in a microtask.
type Tagged = { drawn?: string };
class FakeContext {
	constructor(readonly canvas: Tagged) {}
	setTransform() {}
	clearRect() {
		this.canvas.drawn = "";
	}
	drawElementImage(element: Element) {
		this.canvas.drawn = element.textContent ?? "";
	}
	drawImage(source: Tagged) {
		this.canvas.drawn = source.drawn ?? "";
	}
}
class FakeOffscreenCanvas implements Tagged {
	drawn?: string;
	#context = new FakeContext(this);
	constructor(
		public width: number,
		public height: number,
	) {}
	getContext() {
		return this.#context;
	}
}

type Draw = { prev: string | null; next: string | null; time: number; size: string };
let draws: Draw[] = [];
let clears = 0;
let cleanups = 0;
const recordingShader: HtmlInCanvasShader<{ tag?: string }> = (canvas) => ({
	clear: () => {
		clears++;
	},
	cleanup: () => {
		cleanups++;
	},
	draw: ({ prevImage, nextImage, time, width, height }) => {
		draws.push({
			prev: prevImage ? ((prevImage as unknown as Tagged).drawn ?? "") : null,
			next: nextImage ? ((nextImage as unknown as Tagged).drawn ?? "") : null,
			time,
			size: `${width}x${height} on ${canvas.width}x${canvas.height}`,
		});
		(canvas as unknown as Tagged).drawn = `${prevImage ? "prev" : ""}${nextImage ? "next" : ""}`;
	},
});
const recording = makeHtmlInCanvasPresentation(recordingShader);

const Scene = ({ label }: { label: string }) => {
	const frame = useCurrentFrame();
	return <div>{`${label}${frame}`}</div>;
};

const series = (...presentations: Array<TransitionPresentation<Record<string, unknown>>>) => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={20}>
			<Scene label="A" />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={presentations[0]}
			timing={linearTiming({ durationInFrames: 10 })}
		/>
		<TransitionSeries.Sequence durationInFrames={20}>
			<Scene label="B" />
		</TransitionSeries.Sequence>
		{presentations[1] ? (
			<>
				<TransitionSeries.Transition
					presentation={presentations[1]}
					timing={linearTiming({ durationInFrames: 10 })}
				/>
				<TransitionSeries.Sequence durationInFrames={20}>
					<Scene label="C" />
				</TransitionSeries.Sequence>
			</>
		) : null}
	</TransitionSeries>
);

let mounted: Mounted | null = null;
async function renderAt(element: React.ReactNode, frame: number): Promise<Mounted> {
	draws = [];
	if (mounted) mounted.at(frame);
	else mounted = renderAtFrame(element, frame, { width: 32, height: 18 });
	await act(async () => {});
	return mounted;
}

describe("HTML-in-canvas presentations in <TransitionSeries>", () => {
	beforeEach(() => {
		vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
		vi.stubGlobal(
			"CanvasRenderingContext2D",
			class {
				drawElementImage() {}
			},
		);
		const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
		proto.getContext = function (this: Tagged & { fake?: FakeContext }) {
			this.fake ??= new FakeContext(this);
			return this.fake;
		};
		proto.requestPaint = function (this: HTMLCanvasElement & { onpaint?: () => void }) {
			queueMicrotask(() => this.onpaint?.());
		};
		clears = 0;
		cleanups = 0;
	});

	afterEach(() => {
		mounted?.unmount();
		mounted = null;
		vi.unstubAllGlobals();
		const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
		delete proto.requestPaint;
	});

	it("draws the exiting scene alone before the transition, both while it plays, the entering one after", async () => {
		const tree = series(recording({ tag: "x" }));
		await renderAt(tree, 5);
		expect(draws).toEqual([{ prev: null, next: "A5", time: 0, size: "32x18 on 32x18" }]);
		const playing = await renderAt(tree, 15);
		// Only the entering scene draws, with both images of the same frame.
		expect(draws.at(-1)).toEqual({ prev: "B5", next: "A15", time: 0.5, size: "32x18 on 32x18" });
		expect(draws.every((d) => d.prev === "B5")).toBe(true);
		const outputs = playing.container.querySelectorAll("canvas:not([content])");
		expect([...outputs].map((c) => (c as unknown as Tagged).drawn)).toEqual(["", "prevnext"]);
		expect(clears).toBeGreaterThan(0);
		await renderAt(tree, 25);
		expect(draws).toEqual([{ prev: "B15", next: null, time: 0, size: "32x18 on 32x18" }]);
	});

	it("lays each scene out in a drawable canvas next to its output canvas", async () => {
		const { container } = await renderAt(series(recording({})), 15);
		const hidden = [...container.querySelectorAll("canvas[content='drawable']")];
		expect(hidden).toHaveLength(2);
		for (const canvas of hidden) {
			expect(canvas.getAttribute("width")).toBe("32");
			expect(canvas.getAttribute("style")).toBe(
				"width: 100%; height: 100%; position: absolute; inset: 0px; visibility: hidden;",
			);
			const drawable = canvas.firstElementChild as HTMLElement;
			expect(drawable.hasAttribute("drawable")).toBe(true);
			expect(drawable.getAttribute("style")).toContain("visibility: visible");
			const output = canvas.nextElementSibling as HTMLElement;
			expect(output.tagName).toBe("CANVAS");
			expect(output.getAttribute("style")).toContain("pointer-events: none");
		}
	});

	it("wraps a scene between two canvas transitions once, drawn by the entering side", async () => {
		const tree = series(recording({}), recording({}));
		// B (frames 10 to 29) enters through the first transition and exits through the second
		// (frames 20 to 29), C starts at 20.
		const { container } = await renderAt(tree, 25);
		expect(container.querySelectorAll("canvas[content='drawable']")).toHaveLength(2);
		expect(draws.at(-1)).toEqual({ prev: "C5", next: "B15", time: 0.5, size: "32x18 on 32x18" });
	});

	it("keeps the scene unchanged for a transition before the first scene or after the last", async () => {
		const tree = (
			<TransitionSeries>
				<TransitionSeries.Transition
					presentation={recording({})}
					timing={linearTiming({ durationInFrames: 10 })}
				/>
				<TransitionSeries.Sequence durationInFrames={30}>
					<Scene label="A" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					presentation={recording({})}
					timing={linearTiming({ durationInFrames: 10 })}
				/>
			</TransitionSeries>
		);
		await renderAt(tree, 5);
		expect(draws).toEqual([{ prev: "A5", next: null, time: 0, size: "32x18 on 32x18" }]);
		await renderAt(tree, 25);
		expect(draws).toEqual([{ prev: "A25", next: null, time: 0, size: "32x18 on 32x18" }]);
	});

	it("puts the canvas inside the CSS presentation of the scene's other transition", async () => {
		const { container } = await renderAt(series(fade(), recording({})), 15);
		const canvas = container.querySelector("canvas[content='drawable']") as HTMLElement;
		// B enters with fade() (CSS, an ancestor with opacity) and exits through the canvas.
		expect(canvas.textContent).toBe("B5");
		let ancestor = canvas.parentElement;
		let faded = false;
		while (ancestor) {
			if (ancestor.style.opacity === "0.5") faded = true;
			ancestor = ancestor.parentElement;
		}
		expect(faded).toBe(true);
	});

	it("releases the shader when the scene unmounts", async () => {
		await renderAt(series(recording({})), 15);
		mounted?.unmount();
		mounted = null;
		expect(cleanups).toBe(2);
	});
});

describe("without the HTML-in-canvas API", () => {
	it("shows the scenes as they are and warns once", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = renderAtFrame(series(recording({})), 15, { width: 32, height: 18 });
		expect(view.container.querySelector("canvas")).toBeNull();
		expect(view.container.textContent).toBe("A15B5");
		expect(warn).toHaveBeenCalledTimes(1);
		view.unmount();
		warn.mockRestore();
	});
});

describe("makeHtmlInCanvasPresentation()", () => {
	it("returns a presentation carrying the shader and the props", () => {
		const presentation = recording({ tag: "x" });
		expect(presentation.canvas).toBe(recordingShader);
		expect(presentation.props).toEqual({ tag: "x" });
		expect(typeof presentation.component).toBe("function");
		expect(dissolve().canvas).toBe(dissolveShader);
	});

	it("rejects a shader that is not a function", () => {
		expect(() => makeHtmlInCanvasPresentation(3 as never)).toThrow(TypeError);
	});

	it("accepts no effects and throws a coded error for effects it cannot apply", () => {
		expect(() => recording({ effects: [] })).not.toThrow();
		expect(() => recording({ effects: [{}] })).toThrow(HtmlInCanvasEffectsUnsupportedError);
		try {
			dissolve({ effects: [{}] });
		} catch (error) {
			expect((error as HtmlInCanvasEffectsUnsupportedError).code).toBe(
				HTML_IN_CANVAS_EFFECTS_UNSUPPORTED,
			);
		}
		expect(() => recording({ effects: "x" as never })).toThrow(TypeError);
		expect(() => recording({ effectsOutputSize: { width: 10, height: 0 } })).toThrow(
			/effectsOutputSize.height/,
		);
		expect(() => recording({ effectsOutputSize: { width: 10, height: 20 } })).not.toThrow();
	});

	it("validates the props of the built-in presentations", () => {
		expect(() => dissolve({ spreadColor: "red" })).toThrow(/spreadColor/);
		expect(() => dissolve({ lineWidth: Number.NaN })).toThrow(/lineWidth/);
		expect(() => bookFlip({ direction: "up" as never })).toThrow(/direction/);
		expect(() => crossZoom({ strength: Number.POSITIVE_INFINITY })).toThrow(/strength/);
	});
});

describe("HtmlInCanvasRegistry", () => {
	it("hands over images of the same frame only and notifies subscribers", () => {
		const registry = new HtmlInCanvasRegistry();
		const image = {} as OffscreenCanvas;
		const listener = vi.fn();
		const stop = registry.subscribe("1", listener);
		registry.publish("1", image, 7);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(registry.get("1", 7)).toBe(image);
		expect(registry.get("1", 8)).toBeNull();
		expect(registry.get("2", 7)).toBeNull();
		stop();
		registry.publish("1", image, 8);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
