// @vitest-environment jsdom
// <Lottie> drives lottie-web (replaced by a fake AnimationItem here): how it creates the
// animation, that it seeks it every frame and never plays it, when it releases readiness, and when
// it re-creates it. Pixels are covered by the golden test (golden.integration.test.ts).
import { CompositionFrame, RemotionEnvironmentContext, readiness } from "@motiojs/core/internals";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;
class FakeItem {
	totalFrames = 50;
	isLoaded: boolean;
	calls: Array<[string, ...unknown[]]> = [];
	listeners = new Map<string, Listener[]>();
	constructor(readonly params: Record<string, unknown>) {
		this.isLoaded = fake.loadedOnCreate;
	}
	goToAndStop(value: number, isFrame: boolean) {
		this.calls.push(["goToAndStop", value, isFrame]);
	}
	setDirection(direction: number) {
		this.calls.push(["setDirection", direction]);
	}
	play() {
		this.calls.push(["play"]);
	}
	destroy() {
		this.calls.push(["destroy"]);
	}
	addEventListener(name: string, listener: Listener) {
		this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
	}
	removeEventListener(name: string, listener: Listener) {
		this.listeners.set(
			name,
			(this.listeners.get(name) ?? []).filter((l) => l !== listener),
		);
	}
	emit(name: string) {
		for (const listener of this.listeners.get(name) ?? []) listener();
	}
}

const fake = { items: [] as FakeItem[], loadedOnCreate: true };

vi.mock("lottie-web", () => ({
	default: {
		loadAnimation: (params: Record<string, unknown>) => {
			const item = new FakeItem(params);
			fake.items.push(item);
			return item;
		},
	},
}));

const { Lottie } = await import("./lottie.js");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = {
	id: "test",
	width: 100,
	height: 100,
	fps: 30,
	durationInFrames: 200,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

const DATA = { v: "5.7.4", fr: 25, ip: 0, op: 50, w: 100, h: 100, layers: [] };

let current: ReactNode = null;
const Content = () => <>{current}</>;

function mount(node: ReactNode, frame: number) {
	current = node;
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
	const env = {
		isStudio: false,
		isRendering: true,
		isPlayer: false,
		isReadOnlyStudio: false,
		isClientSideRendering: false,
	};
	const draw = (f: number, next?: ReactNode) =>
		act(() => {
			if (next !== undefined) current = next;
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

const seeks = (item: FakeItem) => item.calls.filter((c) => c[0] === "goToAndStop").map((c) => c[1]);

afterEach(() => {
	fake.items = [];
	fake.loadedOnCreate = true;
	readiness.reset();
});

describe("Lottie", () => {
	it("creates a paused animation in its div with the renderer options", () => {
		const view = mount(
			<Lottie
				animationData={DATA}
				renderer="canvas"
				preserveAspectRatio="xMinYMin slice"
				assetsPath="/assets/"
				className="a"
				style={{ width: 10 }}
			/>,
			0,
		);
		const [item] = fake.items as [FakeItem];
		const div = view.container.querySelector("div.a");
		expect(item.params).toEqual({
			container: div,
			autoplay: false,
			animationData: DATA,
			renderer: "canvas",
			rendererSettings: { preserveAspectRatio: "xMinYMin slice" },
			assetsPath: "/assets/",
		});
		expect(view.container.innerHTML).toBe('<div class="a" style="width: 10px;"></div>');
		view.unmount();
	});

	it("seeks every frame and never plays", () => {
		const onAnimationLoaded = vi.fn();
		const props = { animationData: DATA, loop: true, playbackRate: 1.5, onAnimationLoaded };
		const view = mount(<Lottie {...props} />, 0);
		for (const frame of [1, 33, 34, 100]) view.at(frame);
		const [item] = fake.items as [FakeItem];
		expect(seeks(item)).toEqual([0, 1.5, 49, 0.9999999999999964, 0]);
		expect(item.calls.some((c) => c[0] === "play")).toBe(false);
		expect(onAnimationLoaded).toHaveBeenCalledExactlyOnceWith(item);
		view.unmount();
		expect(item.calls.at(-1)).toEqual(["destroy"]);
	});

	it("sets lottie-web's direction and mirrors the frame for backward", () => {
		const view = mount(<Lottie animationData={DATA} direction="backward" />, 3);
		const [item] = fake.items as [FakeItem];
		expect(item.calls.slice(0, 2)).toEqual([
			["setDirection", -1],
			["goToAndStop", 46, true],
		]);
		view.unmount();
	});

	it("holds readiness until lottie-web has loaded the animation", () => {
		fake.loadedOnCreate = false;
		const view = mount(<Lottie animationData={DATA} />, 0);
		expect(readiness.openHandles().map((h) => h.label)).toEqual(["Loading <Lottie> animation"]);
		act(() => fake.items[0]?.emit("DOMLoaded"));
		expect(readiness.openHandles()).toEqual([]);
		view.unmount();
	});

	it("also waits for image assets", () => {
		const withImage = { ...DATA, assets: [{ id: "i", w: 1, h: 1, p: "a.png", u: "", e: 0 }] };
		const view = mount(<Lottie animationData={withImage} />, 0);
		expect(readiness.openHandles()).toHaveLength(1);
		act(() => fake.items[0]?.emit("loaded_images"));
		expect(readiness.openHandles()).toEqual([]);
		view.unmount();
	});

	it("re-creates the animation only when animationData changes identity", () => {
		const view = mount(<Lottie animationData={DATA} />, 0);
		view.at(1, <Lottie animationData={DATA} loop />);
		expect(fake.items).toHaveLength(1);
		view.at(2, <Lottie animationData={{ ...DATA }} />);
		expect(fake.items).toHaveLength(2);
		expect(fake.items[0]?.calls.at(-1)).toEqual(["destroy"]);
		expect(seeks(fake.items[1] as FakeItem)).toEqual([2]);
		view.unmount();
	});

	it("restarts the loop after trimBefore and holds a frozen frame", () => {
		const view = mount(<Lottie animationData={DATA} loop trimBefore={30} />, 19);
		view.at(20);
		const [item] = fake.items as [FakeItem];
		expect(seeks(item)).toEqual([49, 30]);
		view.unmount();
		const frozen = mount(<Lottie animationData={DATA} loop freeze={70} />, 0);
		expect(seeks(fake.items[1] as FakeItem)).toEqual([49]);
		frozen.unmount();
	});
});
