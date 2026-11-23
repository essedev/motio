// @vitest-environment jsdom
import { act, Component, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaUtilsAudioData } from "./types.js";

const core = vi.hoisted(() => {
	let next = 1;
	const open = new Set<number>();
	return {
		open,
		cancelled: [] as unknown[],
		delayRender: vi.fn(() => {
			const h = next++;
			open.add(h);
			return h;
		}),
		continueRender: vi.fn((h: number) => {
			open.delete(h);
		}),
		cancelRender: vi.fn((err: unknown) => {
			core.cancelled.push(err);
			throw err;
		}),
	};
});
vi.mock("@motiojs/core", () => ({
	delayRender: core.delayRender,
	continueRender: core.continueRender,
	cancelRender: core.cancelRender,
}));

const loader = vi.hoisted(() => ({
	calls: [] as {
		src: string;
		sampleRate: number | undefined;
		resolve(d: unknown): void;
		reject(e: unknown): void;
	}[],
}));
vi.mock("./get-audio-data.js", () => ({
	DEFAULT_SAMPLE_RATE: 48000,
	getAudioData: (src: string, options?: { sampleRate?: number }) =>
		new Promise((resolve, reject) =>
			loader.calls.push({ src, sampleRate: options?.sampleRate, resolve, reject }),
		),
}));

const windowed = vi.hoisted(() => ({
	reads: [] as { channel: number; from: number; to: number }[],
	fail: null as Error | null,
	channels: 2,
}));
vi.mock("./windowed-source.js", () => ({
	openWindowedSource: async () => {
		if (windowed.fail) throw windowed.fail;
		return {
			sampleRate: 100,
			numberOfChannels: windowed.channels,
			durationInSeconds: 4,
			frames: 400,
			async read(channel: number, from: number, to: number) {
				windowed.reads.push({ channel, from, to });
				return Float32Array.from({ length: to - from }, (_, i) => (from + i) / 1000);
			},
		};
	},
}));

const { useAudioData } = await import("./use-audio-data.js");
const { useWindowedAudioData } = await import("./use-windowed-audio-data.js");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = (id: string, sampleRate = 48000): MediaUtilsAudioData => ({
	channelWaveforms: [new Float32Array(4)],
	sampleRate,
	durationInSeconds: 1,
	numberOfChannels: 1,
	resultId: id,
	isRemote: false,
});

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	container = document.createElement("div");
	root = createRoot(container);
	loader.calls.length = 0;
	windowed.reads.length = 0;
	windowed.fail = null;
	windowed.channels = 2;
	core.open.clear();
	core.cancelled.length = 0;
	vi.clearAllMocks();
});
afterEach(() => act(() => root.unmount()));

let latest: MediaUtilsAudioData | null = null;
function AudioProbe(props: { src: string; sampleRate?: number }) {
	latest = useAudioData(
		props.src,
		props.sampleRate === undefined ? undefined : { sampleRate: props.sampleRate },
	);
	return null;
}

let windowedLatest: ReturnType<typeof useWindowedAudioData> | null = null;
let thrown: unknown = null;
interface WindowedProps {
	frame: number;
	windowInSeconds?: number;
	channelIndex?: number;
}
function WindowedProbe(props: WindowedProps) {
	windowedLatest = useWindowedAudioData({
		src: "/long.wav",
		fps: 10,
		windowInSeconds: 1,
		...props,
	});
	return null;
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	override state = { failed: false };
	static getDerivedStateFromError(e: unknown) {
		thrown = e;
		return { failed: true };
	}
	override render() {
		return this.state.failed ? null : this.props.children;
	}
}

describe("useAudioData", () => {
	const render = (props: { src: string; sampleRate?: number }) =>
		act(() => root.render(createElement(AudioProbe, props)));

	it("returns null and holds the render until the data is committed", async () => {
		await render({ src: "/a.wav" });
		expect(latest).toBeNull();
		expect(core.open.size).toBe(1);
		expect(loader.calls[0]).toMatchObject({ src: "/a.wav", sampleRate: 48000 });
		await act(async () => loader.calls[0]?.resolve(fake("a")));
		expect(latest?.resultId).toBe("a");
		expect(core.open.size).toBe(0);
	});

	it("keeps the previous data while a new src loads and ignores the superseded load", async () => {
		await render({ src: "/a.wav" });
		await act(async () => loader.calls[0]?.resolve(fake("a")));
		await render({ src: "/b.wav" });
		expect(latest?.resultId).toBe("a");
		await render({ src: "/c.wav", sampleRate: 8000 });
		await act(async () => loader.calls[1]?.resolve(fake("b")));
		expect(latest?.resultId).toBe("a");
		await act(async () => loader.calls[2]?.resolve(fake("c", 8000)));
		expect(latest?.resultId).toBe("c");
		expect(core.open.size).toBe(0);
		expect(core.cancelRender).not.toHaveBeenCalled();
	});

	it("fails the render when loading fails, but not after unmount", async () => {
		await render({ src: "/bad.wav" });
		await act(async () => loader.calls[0]?.reject(new Error("Unable to decode audio data")));
		expect((core.cancelled[0] as Error).message).toBe("Unable to decode audio data");
		expect(core.open.size).toBe(0);
		await render({ src: "/late.wav" });
		await act(() => root.unmount());
		expect(core.open.size).toBe(0);
		await act(async () => loader.calls[1]?.reject(new Error("late")));
		expect(core.cancelled).toHaveLength(1);
		root = createRoot(container);
	});
});

describe("useWindowedAudioData", () => {
	const render = async (props: WindowedProps) => {
		await act(async () =>
			root.render(createElement(Boundary, null, createElement(WindowedProbe, props))),
		);
		await act(async () => {});
	};

	it("loads the windows around the frame and reports the offset", async () => {
		await render({ frame: 0, channelIndex: 1 });
		expect(windowedLatest?.dataOffsetInSeconds).toBe(0);
		expect(windowedLatest?.audioData?.resultId).toBe("/long.wav-windows-0,1");
		expect(windowedLatest?.audioData?.channelWaveforms[0]).toHaveLength(200);
		expect(windowed.reads).toEqual([
			{ channel: 1, from: 0, to: 100 },
			{ channel: 1, from: 100, to: 200 },
		]);
		await render({ frame: 25, channelIndex: 1 });
		expect(windowedLatest?.dataOffsetInSeconds).toBe(1);
		expect(windowedLatest?.audioData?.resultId).toBe("/long.wav-windows-1,2,3");
		expect(windowedLatest?.audioData?.channelWaveforms[0]?.[0]).toBeCloseTo(0.1, 6);
		expect(windowed.reads.map((r) => r.from)).toEqual([0, 100, 200, 300]);
		expect(core.open.size).toBe(0);
	});

	it("refuses a changing windowInSeconds", async () => {
		await render({ frame: 0 });
		await render({ frame: 0, windowInSeconds: 2 });
		expect((thrown as Error).message).toMatch(
			/^windowInSeconds changed from 1 to 2: keep it the same/,
		);
	});

	it("fails the render for a channel the audio lacks", async () => {
		windowed.channels = 1;
		await render({ frame: 0, channelIndex: 1 });
		expect((core.cancelled[0] as Error).message).toBe(
			"channelIndex is 1, but /long.wav has 1 channel: use 0.",
		);
		expect(core.open.size).toBe(0);
	});
});
