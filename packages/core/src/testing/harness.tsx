// Test helpers for core component tests (jsdom). Not built into dist.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CompositionFrame } from "../composition/composition-frame.js";
import type { AnyComponent } from "../composition/types.js";
import type { VideoConfig } from "../timeline/contexts.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A video config with defaults for tests. */
export function makeConfig(overrides: Partial<VideoConfig> = {}): VideoConfig {
	return {
		id: "test",
		width: 640,
		height: 360,
		fps: 30,
		durationInFrames: 60,
		defaultProps: {},
		props: {},
		defaultCodec: null,
		defaultOutName: null,
		defaultVideoImageFormat: null,
		defaultPixelFormat: null,
		defaultProResProfile: null,
		defaultSampleRate: null,
		...overrides,
	};
}

/** A mounted test tree that can be re-rendered at other frames. */
export interface Mounted {
	container: HTMLElement;
	/** Renders the same tree at another frame. */
	at(frame: number): void;
	unmount(): void;
}

/** Renders `children` at `frame` inside a composition with the given config. */
export function renderAtFrame(
	children: ReactNode,
	frame: number,
	config: Partial<VideoConfig> = {},
): Mounted {
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
	const full = makeConfig(config);
	const Content: AnyComponent = () => <>{children}</>;
	const draw = (f: number) => {
		act(() => {
			root ??= createRoot(container);
			root.render(<CompositionFrame component={Content} config={full} frame={f} />);
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
