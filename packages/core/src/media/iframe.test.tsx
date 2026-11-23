import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readiness } from "../readiness/registry.js";
import { renderAtFrame } from "../testing/harness.js";
import { IFrame } from "./iframe.js";

afterEach(() => readiness.reset());

describe("<IFrame>", () => {
	// Markup recorded from the published package with react-dom/server.
	it("renders the same markup as Remotion's IFrame", () => {
		expect(renderToStaticMarkup(h(IFrame, { src: "https://example.com/a" }))).toBe(
			'<iframe referrerPolicy="strict-origin-when-cross-origin" src="https://example.com/a"></iframe>',
		);
		expect(
			renderToStaticMarkup(
				h(IFrame, {
					src: "x",
					referrerPolicy: "no-referrer",
					delayRenderRetries: 1,
					delayRenderTimeoutInMilliseconds: 100,
				}),
			),
		).toBe('<iframe referrerPolicy="no-referrer" src="x"></iframe>');
		expect(
			renderToStaticMarkup(h(IFrame, { src: "x", id: "i", allow: "autoplay", title: "t" })),
		).toBe(
			'<iframe referrerPolicy="strict-origin-when-cross-origin" src="x" id="i" allow="autoplay" title="t"></iframe>',
		);
	});

	it("holds a readiness handle until the frame has loaded", () => {
		const onLoad = vi.fn();
		const mounted = renderAtFrame(
			<IFrame
				src="about:blank"
				title="t"
				delayRenderTimeoutInMilliseconds={5000}
				onLoad={onLoad}
			/>,
			0,
		);
		const open = readiness.openHandles();
		expect(open.map((handle) => handle.label)).toEqual([
			"Loading <IFrame> with source about:blank",
		]);
		expect(open[0]?.timeoutMs).toBe(5000);
		const iframe = mounted.container.querySelector("iframe") as HTMLIFrameElement;
		act(() => {
			iframe.dispatchEvent(new Event("load"));
		});
		expect(onLoad).toHaveBeenCalledTimes(1);
		expect(readiness.size).toBe(0);
		mounted.unmount();
	});

	it("releases its handle on unmount", () => {
		const mounted = renderAtFrame(<IFrame src="about:blank" title="t" />, 0);
		expect(readiness.size).toBe(1);
		mounted.unmount();
		expect(readiness.size).toBe(0);
	});
});
