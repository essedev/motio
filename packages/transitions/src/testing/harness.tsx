// Test helpers for component tests (jsdom). Not built into dist.
import type { VideoConfig } from "@motiojs/core";
import { CompositionFrame } from "@motiojs/core/internals";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A mounted test tree that can be re-rendered at other frames. */
export interface Mounted {
	container: HTMLElement;
	/** Renders the same tree at another frame. */
	at(frame: number): void;
	unmount(): void;
}

/** Renders `children` at `frame` in a 640x360, 30 fps composition (the features fixture size). */
export function renderAtFrame(
	children: ReactNode,
	frame: number,
	config: Partial<VideoConfig> = {},
): Mounted {
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
	const full: VideoConfig = {
		id: "test",
		width: 640,
		height: 360,
		fps: 30,
		durationInFrames: 148,
		defaultProps: {},
		props: {},
		defaultCodec: null,
		defaultOutName: null,
		defaultVideoImageFormat: null,
		defaultPixelFormat: null,
		defaultProResProfile: null,
		defaultSampleRate: null,
		...config,
	};
	// Lower case: a render function closed over `children`, not a component of its own.
	const content = () => <>{children}</>;
	const draw = (f: number) => {
		act(() => {
			root ??= createRoot(container);
			root.render(<CompositionFrame component={content} config={full} frame={f} />);
		});
	};
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

/** Text of every element matching `selector`, in document order. */
export function texts(container: Element, selector = "[data-label]"): string[] {
	return [...container.querySelectorAll(selector)].map((el) => el.textContent ?? "");
}
