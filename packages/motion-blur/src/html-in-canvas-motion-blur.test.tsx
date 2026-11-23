// @vitest-environment jsdom
// <HtmlInCanvasMotionBlur>: the markup and sample frames measured on the published
// @remotion/motion-blur (probe compositions rendered by Remotion 4.0.545), the averaging of the
// snapshots, validation and the fallback without the HTML-in-canvas API. Pixels are compared with
// Remotion's stills in golden-canvas.integration.test.ts.
import { useCurrentFrame, type VideoConfig } from "@motiojs/core";
import { CompositionFrame } from "@motiojs/core/internals";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlInCanvasMotionBlur, motionBlurSampleFrames } from "./html-in-canvas-motion-blur.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config: VideoConfig = {
	id: "test",
	width: 60,
	height: 30,
	fps: 30,
	durationInFrames: 10,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

const seen: number[] = [];
const Probe = () => {
	const frame = useCurrentFrame();
	seen.push(frame);
	return <i>{frame}</i>;
};

let root: Root | null = null;
let container: HTMLElement | null = null;
function render(element: React.ReactNode, frame: number): HTMLElement {
	seen.length = 0;
	container ??= document.body.appendChild(document.createElement("div"));
	const content = () => <>{element}</>;
	act(() => {
		root ??= createRoot(container as HTMLElement);
		root.render(<CompositionFrame component={content} config={config} frame={frame} />);
	});
	return container;
}

// A stand-in for Chrome's HTML-in-canvas API that records what is drawn, and how.
type Draw = { text: string; alpha: number; op: string };
let draws: Draw[] = [];
let settings: unknown[] = [];
class FakeContext {
	globalAlpha = 1;
	globalCompositeOperation = "source-over";
	setTransform() {}
	clearRect() {}
	drawImage() {}
	drawElementImage(element: Element) {
		draws.push({
			text: element.textContent ?? "",
			alpha: this.globalAlpha,
			op: this.globalCompositeOperation,
		});
	}
}

describe("<HtmlInCanvasMotionBlur>", () => {
	beforeEach(() => {
		draws = [];
		settings = [];
		vi.stubGlobal(
			"CanvasRenderingContext2D",
			class {
				drawElementImage() {}
			},
		);
		const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
		proto.getContext = function (this: { fake?: FakeContext }, _id: string, options: unknown) {
			settings.push(options);
			this.fake ??= new FakeContext();
			return this.fake;
		};
		proto.requestPaint = function (this: HTMLCanvasElement & { onpaint?: () => void }) {
			queueMicrotask(() => this.onpaint?.());
		};
	});

	afterEach(() => {
		act(() => root?.unmount());
		root = null;
		container?.remove();
		container = null;
		vi.unstubAllGlobals();
		delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).requestPaint;
	});

	it("lays the content out once per sample inside a drawable canvas, as Remotion does", () => {
		const view = render(
			<HtmlInCanvasMotionBlur width={40} height={20} samples={2}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			5,
		);
		const blur = view.firstElementChild as HTMLElement;
		expect(blur.getAttribute("style")).toBe(
			"position: absolute; inset: 0px; width: 100%; height: 100%; display: flex; flex-direction: column;",
		);
		expect(blur.innerHTML).toBe(
			'<canvas content="drawable" width="40" height="20" style="width: 40px; height: 20px; position: absolute; visibility: hidden; pointer-events: none;">' +
				'<div drawable="" style="width: 40px; height: 20px; visibility: visible;"><div aria-hidden="false" style="position: absolute; inset: 0px; width: 40px; height: 20px; isolation: isolate; visibility: visible; pointer-events: auto;"><i>5</i></div></div>' +
				'<div aria-hidden="true" drawable="" style="position: absolute; inset: 0px; width: 40px; height: 20px; isolation: isolate; visibility: visible; pointer-events: none;"><i>4.875</i></div>' +
				'<div aria-hidden="true" drawable="" style="position: absolute; inset: 0px; width: 40px; height: 20px; isolation: isolate; visibility: visible; pointer-events: none;"><i>5.125</i></div>' +
				'</canvas><canvas width="40" height="20" style="width: 40px; height: 20px;"></canvas>',
		);
	});

	it("samples 8 moments over half a frame by default, the frames Remotion renders", () => {
		render(
			<HtmlInCanvasMotionBlur width={40} height={20}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			5,
		);
		expect([...new Set(seen)]).toEqual([
			5, 4.78125, 4.84375, 4.90625, 4.96875, 5.03125, 5.09375, 5.15625, 5.21875,
		]);
	});

	it("adds the snapshots with lighter at 1/n each on float16 canvases", async () => {
		render(
			<HtmlInCanvasMotionBlur width={40} height={20} samples={4} shutterAngle={360}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			3,
		);
		await act(async () => {});
		expect(draws).toEqual(
			["2.625", "2.875", "3.125", "3.375"].map((text) => ({ text, alpha: 0.25, op: "lighter" })),
		);
		expect(settings).toContainEqual({ colorType: "float16" });
	});

	it("keeps the samples within the frames the sequence shows and follows its speed", () => {
		// from 3, durationInFrames 4: the first frame of the content clamps the earlier sample.
		render(
			<HtmlInCanvasMotionBlur width={40} height={20} samples={2} from={3} durationInFrames={4}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			3,
		);
		expect([...new Set(seen)]).toEqual([0, 0.125]);
		render(
			<HtmlInCanvasMotionBlur width={40} height={20} samples={2} playbackRate={2} trimBefore={2}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			2,
		);
		expect([...new Set(seen)]).toEqual([6, 5.75, 6.25]);
		expect(motionBlurSampleFrames(22, 6, 180, 2, 4, 22).at(-1)).toBe(22);
	});

	it("draws one snapshot at the current frame when disabled or with a zero shutter angle", async () => {
		for (const props of [{ disabled: true }, { shutterAngle: 0 }, { samples: 1 }]) {
			draws = [];
			render(
				<HtmlInCanvasMotionBlur width={40} height={20} {...props}>
					<Probe />
				</HtmlInCanvasMotionBlur>,
				5,
			);
			await act(async () => {});
			expect([...new Set(seen)]).toEqual([5]);
			expect(draws.at(-1)).toEqual({ text: "5", alpha: 1, op: "lighter" });
		}
	});

	it("rejects invalid sizes, sample counts and shutter angles", () => {
		const bad = [
			{ width: 0, height: 10 },
			{ width: 10.5, height: 10 },
			{ width: 10, height: Number.NaN },
			{ width: 10, height: 10, samples: 0 },
			{ width: 10, height: 10, samples: 65 },
			{ width: 10, height: 10, samples: 2.5 },
			{ width: 10, height: 10, shutterAngle: -1 },
			{ width: 10, height: 10, shutterAngle: 361 },
		];
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const props of bad) {
			expect(() =>
				render(<HtmlInCanvasMotionBlur {...(props as { width: number; height: number })} />, 0),
			).toThrow(TypeError);
			act(() => root?.unmount());
			root = null;
		}
		error.mockRestore();
	});
});

describe("<HtmlInCanvasMotionBlur> without the HTML-in-canvas API", () => {
	afterEach(() => {
		act(() => root?.unmount());
		root = null;
		container?.remove();
		container = null;
	});

	it("shows the content unblurred and warns once", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = render(
			<HtmlInCanvasMotionBlur width={40} height={20}>
				<Probe />
			</HtmlInCanvasMotionBlur>,
			4,
		);
		expect(view.querySelector("canvas")).toBeNull();
		expect(view.textContent).toBe("4");
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});
