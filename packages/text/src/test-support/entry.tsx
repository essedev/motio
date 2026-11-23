// Browser entry of the TextBackground integration tests: renders blocks of text on request and
// exposes what the tests read on `window.__textTest`.
import { readiness } from "@motiojs/core/internals";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { TextBackground, type TextBackgroundProps } from "../index.js";

let root: Root | null = null;
const host = document.createElement("div");
document.body.appendChild(host);

interface Scenario {
	/** Lines separated by "\n" become `<br />`. */
	text: string;
	props?: Omit<TextBackgroundProps, "children">;
	/** Styles of a wrapper around the block (a transform, a width). */
	wrapper?: CSSProperties;
}

function render({ text, props = {}, wrapper = {} }: Scenario): void {
	root?.unmount();
	root = createRoot(host);
	const parts = text.split("\n");
	flushSync(() =>
		root?.render(
			<div style={{ position: "absolute", left: 50, top: 50, ...wrapper }}>
				<TextBackground {...props}>
					{parts.map((part, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static test content
						<span key={i}>
							{i > 0 ? <br /> : null}
							{part}
						</span>
					))}
				</TextBackground>
			</div>,
		),
	);
}

const settle = async () => {
	for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
};

/** What the tests read: the path, the svg box and the text's line fragments, in page pixels. */
function read() {
	const svg = host.querySelector("svg");
	const path = svg?.querySelector("path");
	const text = host.querySelector("div > div > span:last-child") as HTMLElement | null;
	return {
		d: path?.getAttribute("d") ?? null,
		fill: path?.getAttribute("fill") ?? null,
		stroke: path?.getAttribute("stroke") ?? null,
		strokeWidth: path?.getAttribute("stroke-width") ?? null,
		strokeLinejoin: path?.getAttribute("stroke-linejoin") ?? null,
		filter: svg ? getComputedStyle(svg).filter : null,
		svg: svg
			? {
					left: svg.style.left,
					top: svg.style.top,
					width: svg.width.baseVal.value,
					height: svg.height.baseVal.value,
				}
			: null,
		fragments: text
			? [...text.getClientRects()].map((r) => ({
					left: r.left,
					right: r.right,
					top: r.top,
					bottom: r.bottom,
				}))
			: [],
		svgRect: svg
			? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(
					svg.getBoundingClientRect(),
				)
			: null,
		openHandles: readiness.openHandles().map((h) => h.label),
	};
}

Object.assign(window, {
	__textTest: {
		render: (scenario: Scenario) => render(scenario),
		settle,
		read,
		/** Width of a string in a font, from the canvas, for comparison with the measured lines. */
		textWidth: (font: string, value: string) => {
			const context = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
			context.font = font;
			return context.measureText(value).width;
		},
	},
});
document.body.dataset.ready = "true";
