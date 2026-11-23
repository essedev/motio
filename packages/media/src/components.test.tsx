// @vitest-environment jsdom
import { Sequence } from "@motiojs/core";
import {
	audioIntents,
	CompositionFrame,
	type MediaPlayback,
	MediaPlaybackContext,
	RemotionEnvironmentContext,
	readiness,
	type SharedAudioPool,
} from "@motiojs/core/internals";
import { RUN_CONTEXT_GLOBAL } from "@motiojs/core/protocol";
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Html5Audio } from "./html5-audio.js";
import { Html5Video } from "./html5-video.js";
import { Audio } from "./media-audio.js";
import { Video } from "./media-video.js";
import { OffthreadVideo } from "./offthread-video.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

interface Mounted {
	container: HTMLElement;
	at(frame: number): void;
	unmount(): void;
}

function mount(
	node: ReactNode,
	frame: number,
	options: { rendering: boolean; playback?: MediaPlayback | null },
): Mounted {
	current = node;
	const container = document.createElement("div");
	document.body.appendChild(container);
	let root: Root | null = null;
	const env = {
		isStudio: false,
		isRendering: options.rendering,
		isPlayer: !options.rendering,
		isReadOnlyStudio: false,
		isClientSideRendering: false,
	};
	const draw = (f: number) =>
		act(() => {
			root ??= createRoot(container);
			root.render(
				<RemotionEnvironmentContext.Provider value={env}>
					<MediaPlaybackContext.Provider value={options.playback ?? null}>
						<CompositionFrame component={Content} config={CONFIG} frame={f} />
					</MediaPlaybackContext.Provider>
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

function renderError(node: ReactNode, rendering = true): unknown {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	let error: unknown;
	try {
		const m = mount(node, 0, { rendering });
		m.unmount();
	} catch (e) {
		error = e;
	} finally {
		spy.mockRestore();
	}
	return error;
}

beforeAll(() => {
	Object.defineProperty(globalThis, RUN_CONTEXT_GLOBAL, {
		value: { mediaBaseUrl: "http://media.test/", isRendering: true },
		configurable: true,
	});
});

afterEach(() => {
	audioIntents.clear();
	vi.restoreAllMocks();
});

const abs = (path: string) => new URL(path, document.baseURI).href;

describe("audio intents in a render", () => {
	it("reports the source position, rate and volume on each frame", () => {
		const m = mount(
			<Sequence from={15}>
				<Html5Audio src="/clicks.wav" trimBefore={6} volume={(f) => f / 10} />
			</Sequence>,
			10,
			{ rendering: true },
		);
		expect(audioIntents.snapshot()).toEqual([]);
		m.at(20);
		expect(audioIntents.snapshot()).toEqual([
			{
				id: "0",
				src: abs("/clicks.wav"),
				sourceFrame: 11,
				playbackRate: 1,
				toneFrequency: 1,
				preservePitch: true,
				volume: 0.5,
				audioStreamIndex: null,
			},
		]);
		m.unmount();
		expect(audioIntents.size).toBe(0);
	});

	it("lets the pitch follow the rate in the @remotion/media Audio by default", () => {
		const m = mount(<Audio src="/a.mp3" playbackRate={2} toneFrequency={1.5} />, 10, {
			rendering: true,
		});
		expect(audioIntents.snapshot()).toMatchObject([
			{ sourceFrame: 20, playbackRate: 2, toneFrequency: 1.5, preservePitch: false },
		]);
		m.unmount();
	});

	it("restarts the source and the volume curve on every loop iteration", () => {
		const volumes: number[] = [];
		const node = (behavior: "repeat" | "extend") => (
			<Audio
				src="/a.mp3"
				loop
				durationInFrames={30}
				loopVolumeCurveBehavior={behavior}
				volume={(f) => {
					volumes.push(f);
					return 1;
				}}
			/>
		);
		const repeat = mount(node("repeat"), 45, { rendering: true });
		expect(audioIntents.snapshot()).toMatchObject([{ sourceFrame: 15 }]);
		expect(volumes.at(-1)).toBe(15);
		repeat.unmount();
		const extend = mount(node("extend"), 45, { rendering: true });
		expect(volumes.at(-1)).toBe(45);
		extend.unmount();
	});

	it("reports nothing while muted, silent or frozen", () => {
		for (const node of [
			<Html5Audio key="m" src="/a.wav" muted />,
			<Html5Audio key="v" src="/a.wav" volume={0} />,
			<Audio key="f" src="/a.wav" freeze={3} />,
		]) {
			const m = mount(node, 5, { rendering: true });
			expect(audioIntents.snapshot()).toEqual([]);
			m.unmount();
		}
	});

	it("numbers identical sources so both are mixed", () => {
		const m = mount(
			<>
				<Html5Audio src="/a.wav" volume={0.5} />
				<Html5Audio src="/a.wav" volume={0.25} />
			</>,
			3,
			{ rendering: true },
		);
		expect(audioIntents.snapshot().map((i) => [i.id, i.volume])).toEqual([
			["0", 0.25],
			["1", 0.5],
		]);
		m.unmount();
	});

	it("reports the audio of videos unless muted", () => {
		const m = mount(
			<>
				<OffthreadVideo src="/v.mp4" />
				<Html5Video src="/w.mp4" muted />
			</>,
			3,
			{ rendering: true },
		);
		expect(audioIntents.snapshot().map((i) => i.src)).toEqual([abs("/v.mp4")]);
		m.unmount();
	});
});

describe("video elements in a render", () => {
	it("<OffthreadVideo> shows the host's frame for the time, holding a readiness handle", () => {
		const before = readiness.size;
		const m = mount(<OffthreadVideo src="/v.mp4" trimBefore={15} transparent />, 15, {
			rendering: true,
		});
		const img = m.container.querySelector("img");
		expect(img).not.toBeNull();
		const url = new URL(img?.getAttribute("src") ?? "");
		expect(url.origin + url.pathname).toBe("http://media.test/frame");
		expect(url.searchParams.get("src")).toBe(abs("/v.mp4"));
		expect(Number(url.searchParams.get("t"))).toBeCloseTo(1, 12);
		expect(url.searchParams.get("mode")).toBe("floor");
		expect(url.searchParams.get("alpha")).toBe("1");
		expect(readiness.size).toBe(before + 1);
		m.unmount();
		expect(readiness.size).toBe(before);
	});

	it("<Html5Video> keeps the native element", () => {
		vi.stubGlobal("fetch", () => new Promise(() => {}));
		const ref = createRef<HTMLVideoElement>();
		const m = mount(<Html5Video ref={ref} src="/v.mp4" className="x" />, 0, { rendering: true });
		expect(ref.current).toBeInstanceOf(HTMLVideoElement);
		expect(ref.current?.className).toBe("x");
		m.unmount();
	});

	it("the @remotion/media <Video> draws into a canvas fitted with objectFit", () => {
		vi.stubGlobal("fetch", () => new Promise(() => {}));
		const m = mount(<Video src="/v.mp4" objectFit="cover" style={{ width: 100 }} />, 0, {
			rendering: true,
		});
		const canvas = m.container.querySelector("canvas");
		expect(canvas?.style.objectFit).toBe("cover");
		expect(canvas?.style.width).toBe("100px");
		m.unmount();
	});
});

describe("validation", () => {
	it("rejects invalid props with the component name", () => {
		expect(
			String(renderError(<OffthreadVideo src="/v.mp4" {...({ imageFormat: "png" } as object)} />)),
		).toMatch(/imageFormat" was removed/);
		expect(String(renderError(<Html5Audio src="/a.wav" toneFrequency={3} />))).toMatch(
			/<Html5Audio>: "toneFrequency" must be a number from 0.01 to 2/,
		);
		expect(String(renderError(<Html5Video src="/v.mp4" startFrom={1} trimBefore={2} />))).toMatch(
			/deprecated name of "trimBefore"/,
		);
		expect(String(renderError(<Video src="/v.mp4" effects={[{}]} />))).toMatch(
			/"effects" are not supported/,
		);
		expect(String(renderError(<Audio src="" />))).toMatch(/needs a "src" string/);
		expect(String(renderError(<Audio src="/a.wav" playbackRate={-1} />))).toMatch(
			/reverse playback is not supported/,
		);
	});
});

describe("preview mode", () => {
	const playback = (patch: Partial<MediaPlayback> = {}): MediaPlayback => ({
		playing: false,
		playbackRate: 1,
		volume: 1,
		muted: false,
		sharedAudio: null,
		...patch,
	});

	it("applies the Player's volume and mute on top of the component's", () => {
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		const ref = createRef<HTMLVideoElement>();
		const m = mount(<Html5Video ref={ref} src="/v.mp4" volume={0.5} />, 0, {
			rendering: false,
			playback: playback({ volume: 0.5 }),
		});
		expect(ref.current?.volume).toBeCloseTo(0.25, 12);
		expect(ref.current?.muted).toBe(false);
		m.unmount();
		const muted = mount(<Html5Video ref={ref} src="/v.mp4" />, 0, {
			rendering: false,
			playback: playback({ muted: true }),
		});
		expect(ref.current?.muted).toBe(true);
		muted.unmount();
	});

	it("plays the element while the Player plays, at the combined rate", () => {
		const play = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockImplementation(() => Promise.resolve());
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(true);
		const ref = createRef<HTMLVideoElement>();
		const m = mount(<OffthreadVideo ref={ref as never} src="/v.mp4" playbackRate={2} />, 0, {
			rendering: false,
			playback: playback({ playing: true, playbackRate: 1.5 }),
		});
		expect(play).toHaveBeenCalled();
		expect(ref.current?.playbackRate).toBe(3);
		m.unmount();
	});

	it("borrows a shared audio tag from the Player and returns it on unmount", () => {
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		const el = document.createElement("audio");
		const pool: SharedAudioPool = {
			size: 1,
			acquire: vi.fn(() => el),
			release: vi.fn(),
		};
		const ref = createRef<HTMLAudioElement>();
		const m = mount(<Html5Audio ref={ref} src="/a.wav" />, 0, {
			rendering: false,
			playback: playback({ sharedAudio: pool }),
		});
		expect(pool.acquire).toHaveBeenCalledTimes(1);
		expect(ref.current).toBe(el);
		expect(el.getAttribute("src")).toBe("/a.wav");
		expect(m.container.querySelector("audio")).toBeNull();
		m.unmount();
		expect(pool.release).toHaveBeenCalledWith(el);
	});
});
