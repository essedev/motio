// @vitest-environment jsdom
import {
	delayRender,
	getRemotionEnvironment,
	useBufferState,
	useCurrentFrame,
	useCurrentScale,
	useRemotionEnvironment,
	useVideoConfig,
} from "@motiojs/core";
import { act, createRef, StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Player } from "./player.js";
import { advance, Catch, type Mounted, mount, useFakeClock } from "./test-support/dom.js";
import type { PlayerEventTypes, PlayerProps, PlayerRef } from "./types.js";

function Probe(props: { label?: string }) {
	const frame = useCurrentFrame();
	const config = useVideoConfig();
	const scale = useCurrentScale();
	const env = useRemotionEnvironment();
	return (
		<div
			data-testid="probe"
			data-frame={frame}
			data-scale={scale}
			data-player={String(env.isPlayer && getRemotionEnvironment().isPlayer)}
			data-config={`${config.id} ${config.width}x${config.height} ${config.fps} ${config.durationInFrames}`}
		>
			{props.label ?? ""}
		</div>
	);
}

function Broken(): never {
	throw new Error("boom");
}

function Buffering({ block }: { block: boolean }) {
	const buffer = useBufferState();
	useEffect(() => {
		if (!block) return;
		const handle = buffer.delayPlayback();
		return () => handle.unblock();
	}, [block, buffer]);
	return <Probe />;
}

function Delaying() {
	delayRender("never released");
	return <Probe />;
}

const base = {
	component: Probe,
	durationInFrames: 90,
	fps: 30,
	compositionWidth: 1920,
	compositionHeight: 1080,
} satisfies PlayerProps<unknown, { label?: string }>;

let mounted: Mounted | null = null;

function render(props: Partial<PlayerProps<unknown, { label?: string }>> = {}) {
	const ref = createRef<PlayerRef>();
	mounted = mount(<Player ref={ref} {...base} {...(props as object)} />);
	const player = ref.current;
	if (!player) throw new Error("ref not set");
	return { ref, player, m: mounted };
}

function probe(): HTMLElement {
	const el = document.querySelector<HTMLElement>("[data-testid=probe]");
	if (!el) throw new Error("probe not rendered");
	return el;
}

function shownFrame(): number {
	return Number(probe().dataset.frame);
}

type Recorded = { name: keyof PlayerEventTypes; detail: unknown };

function record(player: PlayerRef, names: (keyof PlayerEventTypes)[]): Recorded[] {
	const out: Recorded[] = [];
	for (const name of names) {
		player.addEventListener(name, (e) => out.push({ name, detail: e.detail }));
	}
	return out;
}

const ALL_EVENTS: (keyof PlayerEventTypes)[] = [
	"play",
	"pause",
	"ended",
	"seeked",
	"timeupdate",
	"frameupdate",
	"ratechange",
	"volumechange",
	"mutechange",
	"scalechange",
	"fullscreenchange",
	"error",
	"waiting",
	"resume",
];

beforeEach(() => {
	useFakeClock();
	localStorage.clear();
});

afterEach(() => {
	mounted?.unmount();
	mounted = null;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("rendering", () => {
	it("renders the component at frame 0 with the video config, the scale and the Player environment", () => {
		render({ inputProps: { label: "hello" }, style: { width: 960 } });
		expect(shownFrame()).toBe(0);
		expect(probe().dataset.config).toBe("player-comp 1920x1080 30 90");
		expect(probe().dataset.scale).toBe("0.5");
		expect(probe().dataset.player).toBe("true");
		expect(probe().textContent).toBe("hello");
	});

	it("starts at initialFrame", () => {
		const { player } = render({ initialFrame: 42 });
		expect(shownFrame()).toBe(42);
		expect(player.getCurrentFrame()).toBe(42);
	});

	it("sizes the container from the composition and the style", () => {
		const { player } = render();
		const node = player.getContainerNode();
		expect(node?.style.width).toBe("1920px");
		expect(node?.style.height).toBe("1080px");
		expect(node?.className).toBe("__remotion-player");
		mounted?.rerender(
			<Player {...base} style={{ width: "100%" }} className="mine" overrideInternalClassName="x" />,
		);
		expect(node?.style.width).toBe("100%");
		expect(node?.style.aspectRatio).toBe("1920 / 1080");
		expect(node?.className).toBe("x mine");
	});

	it("hides overflow unless overflowVisible", () => {
		const { player } = render({ overflowVisible: true });
		expect(player.getContainerNode()?.style.overflow).toBe("visible");
	});

	it("isPlayer is false again after the Player unmounts", () => {
		render();
		expect(getRemotionEnvironment().isPlayer).toBe(true);
		mounted?.unmount();
		mounted = null;
		expect(getRemotionEnvironment().isPlayer).toBe(false);
	});
});

describe("prop validation", () => {
	function renderError(props: Record<string, unknown>): unknown {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let caught: unknown = null;
		mounted = mount(
			<Catch onError={(e) => (caught = e)}>
				<Player {...base} {...props} />
			</Catch>,
		);
		return caught;
	}

	it.each([
		[{ durationInFrames: 0 }, /durationInFrames/],
		[{ fps: -1 }, /"fps"/],
		[{ compositionWidth: 0 }, /compositionWidth/],
		[{ lazyComponent: () => Promise.resolve({ default: Probe }) }, /not both/],
		[{ component: undefined }, /"component" or a "lazyComponent"/],
		[{ playbackRate: 0 }, /playbackRate/],
		[{ playbackRate: 11 }, /playbackRate/],
		[{ inFrame: 50, outFrame: 40 }, /greater than "inFrame"/],
		[{ outFrame: 90 }, /outFrame/],
		[{ initialFrame: 90 }, /initialFrame/],
		[{ numberOfSharedAudioTags: -1 }, /numberOfSharedAudioTags/],
		[{ initialVolume: 2 }, /initialVolume/],
	])("rejects %o", (props, message) => {
		expect(String(renderError(props))).toMatch(message);
	});

	it("rejects changing initialFrame after mount", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let caught: unknown = null;
		mounted = mount(
			<Catch onError={(e) => (caught = e)}>
				<Player {...base} initialFrame={0} />
			</Catch>,
		);
		mounted.rerender(
			<Catch onError={(e) => (caught = e)}>
				<Player {...base} initialFrame={5} />
			</Catch>,
		);
		expect(String(caught)).toMatch(/"initialFrame" cannot change/);
	});
});

describe("playback on the clock", () => {
	it("advances at fps on the real clock and dispatches play, frameupdate and timeupdate", () => {
		const { player } = render();
		const events = record(player, ["play", "frameupdate", "timeupdate"]);
		act(() => player.play());
		expect(player.isPlaying()).toBe(true);
		expect(events[0]?.name).toBe("play");
		advance(1000);
		// Animation frames run every 16 ms; the last one before 1000 ms is at 992 ms.
		expect(player.getCurrentFrame()).toBe(Math.floor((992 * 30) / 1000));
		expect(shownFrame()).toBe(player.getCurrentFrame());
		const frameUpdates = events.filter((e) => e.name === "frameupdate");
		expect(frameUpdates.map((e) => (e.detail as { frame: number }).frame)).toEqual(
			Array.from({ length: 29 }, (_, i) => i + 1),
		);
		const timeUpdates = events.filter((e) => e.name === "timeupdate");
		expect(timeUpdates.length).toBeGreaterThanOrEqual(3);
		expect(timeUpdates.length).toBeLessThanOrEqual(5);
	});

	it("plays at the playback rate", () => {
		const { player } = render({ playbackRate: 2 });
		act(() => player.play());
		advance(496);
		expect(player.getCurrentFrame()).toBe(Math.floor((496 * 30 * 2) / 1000));
	});

	it("plays backwards with a negative rate, from the end", () => {
		const { player } = render({ playbackRate: -1 });
		act(() => player.play());
		expect(player.getCurrentFrame()).toBe(89);
		advance(496);
		expect(player.getCurrentFrame()).toBe(89 - Math.floor((496 * 30) / 1000));
	});

	it("re-anchors and dispatches ratechange when playbackRate changes", () => {
		const { player, m } = render();
		const events = record(player, ["ratechange"]);
		act(() => player.play());
		advance(496);
		const at = player.getCurrentFrame();
		m.rerender(<Player ref={{ current: player }} {...base} playbackRate={2} />);
		expect(events).toEqual([{ name: "ratechange", detail: { playbackRate: 2 } }]);
		advance(496);
		expect(player.getCurrentFrame()).toBeGreaterThanOrEqual(at + 29);
		expect(player.getCurrentFrame()).toBeLessThanOrEqual(at + 31);
	});

	it("ends without loop: pause and ended, then back to the start", () => {
		const { player } = render({ durationInFrames: 30 });
		const events = record(player, ["pause", "ended", "seeked"]);
		act(() => player.play());
		advance(1500);
		expect(player.isPlaying()).toBe(false);
		expect(events.map((e) => e.name)).toEqual(["pause", "ended"]);
		expect(player.getCurrentFrame()).toBe(0);
	});

	it("stays on the last frame with moveToBeginningWhenEnded={false}", () => {
		const { player } = render({ durationInFrames: 30, moveToBeginningWhenEnded: false });
		act(() => player.play());
		advance(1500);
		expect(player.getCurrentFrame()).toBe(29);
		// Playing again from the end restarts from the beginning.
		act(() => player.play());
		expect(player.getCurrentFrame()).toBe(0);
	});

	it("loops without ending", () => {
		const { player } = render({ durationInFrames: 30, loop: true });
		const events = record(player, ["ended", "pause"]);
		act(() => player.play());
		advance(1504);
		expect(player.isPlaying()).toBe(true);
		expect(events).toEqual([]);
		expect(player.getCurrentFrame()).toBe(Math.floor((1504 * 30) / 1000) % 30);
	});

	it("plays between inFrame and outFrame and returns to inFrame", () => {
		const { player } = render({ inFrame: 30, outFrame: 44 });
		const frames: number[] = [];
		player.addEventListener("frameupdate", (e) => frames.push(e.detail.frame));
		act(() => player.play());
		expect(player.getCurrentFrame()).toBe(30);
		advance(1000);
		expect(Math.max(...frames)).toBe(44);
		expect(player.isPlaying()).toBe(false);
		expect(player.getCurrentFrame()).toBe(30);
	});

	it("loops between inFrame and outFrame", () => {
		const { player } = render({ inFrame: 30, outFrame: 44, loop: true });
		const frames: number[] = [];
		player.addEventListener("frameupdate", (e) => frames.push(e.detail.frame));
		act(() => player.play());
		advance(2000);
		expect(player.isPlaying()).toBe(true);
		expect(Math.min(...frames)).toBe(30);
		expect(Math.max(...frames)).toBe(44);
	});

	it("pauses, toggles and ignores redundant calls", () => {
		const { player } = render();
		const events = record(player, ["play", "pause"]);
		act(() => player.pause());
		act(() => player.toggle());
		act(() => player.play());
		advance(100);
		act(() => player.toggle());
		const frame = player.getCurrentFrame();
		advance(500);
		expect(player.getCurrentFrame()).toBe(frame);
		expect(events.map((e) => e.name)).toEqual(["play", "pause"]);
	});

	it("pauseAndReturnToPlayStart goes back to where playback started", () => {
		const { player } = render({ initialFrame: 10 });
		act(() => player.pauseAndReturnToPlayStart());
		expect(player.getCurrentFrame()).toBe(10);
		act(() => player.play());
		advance(500);
		expect(player.getCurrentFrame()).toBeGreaterThan(20);
		const events = record(player, ["pause", "seeked"]);
		act(() => player.pauseAndReturnToPlayStart());
		expect(player.isPlaying()).toBe(false);
		expect(player.getCurrentFrame()).toBe(10);
		expect(events).toEqual([
			{ name: "pause", detail: undefined },
			{ name: "seeked", detail: { frame: 10 } },
		]);
	});

	it("autoPlay starts playback on mount", () => {
		const { player } = render({ autoPlay: true });
		expect(player.isPlaying()).toBe(true);
		advance(500);
		expect(player.getCurrentFrame()).toBeGreaterThan(10);
	});

	it("keeps playing under StrictMode and stops on unmount", () => {
		const ref = createRef<PlayerRef>();
		mounted = mount(
			<StrictMode>
				<Player ref={ref} {...base} />
			</StrictMode>,
		);
		const player = ref.current as PlayerRef;
		const events = record(player, ["play"]);
		act(() => player.play());
		advance(496);
		expect(player.getCurrentFrame()).toBe(Math.floor((496 * 30) / 1000));
		expect(events).toHaveLength(1);
		mounted.unmount();
		mounted = null;
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("seeking", () => {
	it("seekTo renders the frame and dispatches seeked and frameupdate", () => {
		const { player } = render();
		const events = record(player, ALL_EVENTS);
		act(() => player.seekTo(45));
		expect(shownFrame()).toBe(45);
		expect(player.getCurrentFrame()).toBe(45);
		expect(events).toEqual([
			{ name: "frameupdate", detail: { frame: 45 } },
			{ name: "seeked", detail: { frame: 45 } },
		]);
	});

	it("rounds and clamps the target frame", () => {
		const { player } = render();
		act(() => player.seekTo(200));
		expect(player.getCurrentFrame()).toBe(89);
		act(() => player.seekTo(-3));
		expect(player.getCurrentFrame()).toBe(0);
		act(() => player.seekTo(10.6));
		expect(player.getCurrentFrame()).toBe(11);
		expect(() => player.seekTo(Number.NaN)).toThrow(/seekTo/);
	});

	it("keeps playing from the new frame when seeking during playback", () => {
		const { player } = render();
		act(() => player.play());
		advance(200);
		act(() => player.seekTo(60));
		expect(player.isPlaying()).toBe(true);
		advance(496);
		expect(player.getCurrentFrame()).toBe(60 + Math.floor((496 * 30) / 1000) + 0);
	});
});

describe("volume", () => {
	it("mutes, unmutes and sets the volume with events", () => {
		const { player } = render();
		const events = record(player, ["mutechange", "volumechange"]);
		expect(player.getVolume()).toBe(1);
		expect(player.isMuted()).toBe(false);
		act(() => player.mute());
		expect(player.isMuted()).toBe(true);
		expect(player.getVolume()).toBe(0);
		act(() => player.mute());
		act(() => player.unmute());
		act(() => player.setVolume(0.4));
		expect(player.getVolume()).toBe(0.4);
		act(() => player.setVolume(0));
		expect(player.isMuted()).toBe(true);
		expect(events).toEqual([
			{ name: "mutechange", detail: { isMuted: true } },
			{ name: "mutechange", detail: { isMuted: false } },
			{ name: "volumechange", detail: { volume: 0.4 } },
			{ name: "volumechange", detail: { volume: 0 } },
		]);
		expect(() => player.setVolume(1.5)).toThrow(/between 0 and 1/);
		expect(() => player.setVolume(-1)).toThrow(/between 0 and 1/);
	});

	it("persists the volume in localStorage and reads it back", () => {
		const first = render();
		act(() => first.player.setVolume(0.3));
		expect(localStorage.getItem("remotion.volumePreference")).toBe("0.3");
		mounted?.unmount();
		const second = render();
		expect(second.player.getVolume()).toBe(0.3);
	});

	it("uses volumePersistenceKey, and initialVolume disables persistence", () => {
		const a = render({ volumePersistenceKey: "my-key" });
		act(() => a.player.setVolume(0.7));
		expect(localStorage.getItem("my-key")).toBe("0.7");
		mounted?.unmount();
		const b = render({ volumePersistenceKey: "my-key", initialVolume: 0.2 });
		expect(b.player.getVolume()).toBe(0.2);
		act(() => b.player.setVolume(0.9));
		expect(localStorage.getItem("my-key")).toBe("0.7");
	});

	it("starts muted with initiallyMuted", () => {
		const { player } = render({ initiallyMuted: true });
		expect(player.isMuted()).toBe(true);
		expect(player.getVolume()).toBe(0);
	});
});

describe("scale", () => {
	it("reports the scale and dispatches scalechange when the size changes", () => {
		const { player, m } = render({ style: { width: 960 } });
		const events = record(player, ["scalechange"]);
		expect(player.getScale()).toBe(0.5);
		m.rerender(<Player ref={{ current: player }} {...base} style={{ width: 480 }} />);
		expect(player.getScale()).toBe(0.25);
		expect(events).toEqual([{ name: "scalechange", detail: { scale: 0.25 } }]);
		expect(probe().dataset.scale).toBe("0.25");
	});
});

describe("fullscreen", () => {
	it("throws when allowFullscreen is false or the browser does not allow it", () => {
		const a = render({ allowFullscreen: false });
		expect(() => a.player.requestFullscreen()).toThrow(/allowFullscreen/);
		mounted?.unmount();
		const b = render();
		expect(() => b.player.requestFullscreen()).toThrow(/does not allow fullscreen/);
	});

	it("enters and leaves fullscreen and dispatches fullscreenchange", () => {
		Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
		let current: Element | null = null;
		Object.defineProperty(document, "fullscreenElement", {
			get: () => current,
			configurable: true,
		});
		document.exitFullscreen = vi.fn(async () => {
			current = null;
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		const { player } = render();
		const node = player.getContainerNode() as HTMLDivElement;
		node.requestFullscreen = vi.fn(async () => {
			current = node;
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		const events = record(player, ["fullscreenchange"]);
		act(() => player.requestFullscreen());
		expect(player.isFullscreen()).toBe(true);
		act(() => player.exitFullscreen());
		expect(player.isFullscreen()).toBe(false);
		expect(events).toEqual([
			{ name: "fullscreenchange", detail: { isFullscreen: true } },
			{ name: "fullscreenchange", detail: { isFullscreen: false } },
		]);
		Reflect.deleteProperty(document, "fullscreenEnabled");
		Reflect.deleteProperty(document, "fullscreenElement");
	});
});

describe("errors", () => {
	it("dispatches error and renders errorFallback", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const ref = createRef<PlayerRef>();
		const errors: Error[] = [];
		mounted = mount(
			<Player
				ref={ref}
				{...base}
				component={Broken}
				errorFallback={({ error }) => <p data-testid="fallback">{error.message}</p>}
			/>,
		);
		// The ref exists before the composition renders; listen and remount the composition.
		ref.current?.addEventListener("error", (e) => errors.push(e.detail.error));
		mounted.rerender(
			<Player
				ref={ref}
				{...base}
				component={() => Broken()}
				errorFallback={({ error }) => <p data-testid="fallback">{error.message}</p>}
			/>,
		);
		expect(document.querySelector("[data-testid=fallback]")?.textContent).toBe("boom");
		expect(errors.map((e) => e.message)).toEqual(["boom"]);
	});
});

describe("buffering", () => {
	it("holds the frame while a handle is open and dispatches waiting and resume at once", () => {
		const ref = createRef<PlayerRef>();
		const props = { ...base, component: Buffering, bufferStateDelayInMilliseconds: 300 };
		mounted = mount(<Player ref={ref} {...props} inputProps={{ block: false }} />);
		const player = ref.current as PlayerRef;
		const events = record(player, ["waiting", "resume"]);
		act(() => player.play());
		advance(496);
		const before = player.getCurrentFrame();
		mounted.rerender(<Player ref={ref} {...props} inputProps={{ block: true }} />);
		expect(events.map((e) => e.name)).toEqual(["waiting"]);
		advance(1000);
		expect(player.getCurrentFrame()).toBe(before);
		expect(player.isPlaying()).toBe(true);
		mounted.rerender(<Player ref={ref} {...props} inputProps={{ block: false }} />);
		expect(events.map((e) => e.name)).toEqual(["waiting", "resume"]);
		advance(496);
		expect(player.getCurrentFrame()).toBe(before + Math.floor((496 * 30) / 1000));
	});

	it("shows the buffering poster only after bufferStateDelayInMilliseconds", () => {
		const ref = createRef<PlayerRef>();
		const props = {
			...base,
			component: Buffering,
			showPosterWhenBuffering: true,
			bufferStateDelayInMilliseconds: 300,
			renderPoster: ({ isBuffering }: { isBuffering: boolean }) => (
				<span data-testid="poster">{String(isBuffering)}</span>
			),
		};
		mounted = mount(<Player ref={ref} {...props} inputProps={{ block: false }} />);
		act(() => ref.current?.play());
		mounted.rerender(<Player ref={ref} {...props} inputProps={{ block: true }} />);
		advance(200);
		expect(document.querySelector("[data-testid=poster]")).toBeNull();
		advance(150);
		expect(document.querySelector("[data-testid=poster]")?.textContent).toBe("true");
	});

	it("delayRender has no effect on playback", () => {
		const { player } = render({ component: Delaying });
		act(() => player.play());
		advance(496);
		expect(player.getCurrentFrame()).toBe(Math.floor((496 * 30) / 1000));
	});
});

describe("poster", () => {
	it("shows when unplayed and hides once playing; paused poster returns on pause", () => {
		const { player, m } = render({
			renderPoster: ({ width, height }) => <span data-testid="poster">{`${width}x${height}`}</span>,
			showPosterWhenUnplayed: true,
			style: { width: 960 },
		});
		expect(document.querySelector("[data-testid=poster]")?.textContent).toBe("960x540");
		act(() => player.play());
		expect(document.querySelector("[data-testid=poster]")).toBeNull();
		act(() => player.pause());
		expect(document.querySelector("[data-testid=poster]")).toBeNull();
		m.rerender(
			<Player
				ref={{ current: player }}
				{...base}
				renderPoster={() => <span data-testid="poster" />}
				showPosterWhenPaused
			/>,
		);
		expect(document.querySelector("[data-testid=poster]")).not.toBeNull();
	});

	it("shows the ended poster only with moveToBeginningWhenEnded={false}", () => {
		const { player } = render({
			durationInFrames: 10,
			moveToBeginningWhenEnded: false,
			showPosterWhenEnded: true,
			renderPoster: () => <span data-testid="poster" />,
		});
		act(() => player.play());
		advance(500);
		expect(document.querySelector("[data-testid=poster]")).not.toBeNull();
	});
});

describe("interaction", () => {
	it("clickToPlay defaults to controls", () => {
		const a = render();
		act(() => a.player.getContainerNode()?.click());
		expect(a.player.isPlaying()).toBe(false);
		mounted?.unmount();
		const b = render({ controls: true });
		act(() => b.player.getContainerNode()?.click());
		expect(b.player.isPlaying()).toBe(true);
		act(() => b.player.getContainerNode()?.click());
		expect(b.player.isPlaying()).toBe(false);
	});

	it("delays the single click by 200 ms with doubleClickToFullscreen", () => {
		const { player } = render({ clickToPlay: true, doubleClickToFullscreen: true });
		act(() => player.getContainerNode()?.click());
		expect(player.isPlaying()).toBe(false);
		advance(200);
		expect(player.isPlaying()).toBe(true);
	});

	it("toggles with the space key when controls are shown", () => {
		const { player } = render({ controls: true });
		const node = player.getContainerNode() as HTMLDivElement;
		act(() => {
			node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		});
		expect(player.isPlaying()).toBe(true);
	});

	it("does not toggle with the space key when spaceKeyToPlayOrPause is false", () => {
		const { player } = render({ controls: true, spaceKeyToPlayOrPause: false });
		act(() => {
			player
				.getContainerNode()
				?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		});
		expect(player.isPlaying()).toBe(false);
	});
});

describe("controls", () => {
	function button(label: string): HTMLButtonElement {
		const el = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
		if (!el) throw new Error(`no button ${label}`);
		return el;
	}

	it("renders the default controls that drive the player", () => {
		const { player } = render({ controls: true });
		act(() => button("Play").click());
		expect(player.isPlaying()).toBe(true);
		act(() => button("Pause").click());
		expect(player.isPlaying()).toBe(false);
		act(() => button("Mute").click());
		expect(player.isMuted()).toBe(true);
		expect(document.querySelector("[aria-label=Volume]")).not.toBeNull();
		expect(document.body.textContent).toContain("0:00 / 0:03");
	});

	it("hides volume controls and uses custom render props", () => {
		render({
			controls: true,
			showVolumeControls: false,
			renderPlayPauseButton: ({ playing }) => <b data-testid="pp">{String(playing)}</b>,
			renderCustomControls: () => <i data-testid="custom" />,
		});
		expect(document.querySelector("[aria-label=Mute]")).toBeNull();
		expect(document.querySelector("[data-testid=pp]")?.textContent).toBe("false");
		expect(document.querySelector("[data-testid=custom]")).not.toBeNull();
	});

	it("hides the controls after the initial delay", () => {
		render({ controls: true });
		const bar = document.querySelector<HTMLElement>("[data-motio-controls]");
		expect(bar?.style.opacity).toBe("1");
		advance(2100);
		expect(bar?.style.opacity).toBe("0");
	});

	it("offers playback rates and applies the chosen one", () => {
		const { player } = render({ controls: true, showPlaybackRateControl: [1, 2] });
		const events = record(player, ["ratechange"]);
		const select = document.querySelector<HTMLSelectElement>("[aria-label='Playback rate']");
		expect(select?.options.length).toBe(2);
		act(() => {
			if (!select) return;
			select.value = "2";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(events).toEqual([{ name: "ratechange", detail: { playbackRate: 2 } }]);
	});
});

describe("lazyComponent and renderLoading", () => {
	it("shows renderLoading until the lazy component resolves", async () => {
		let resolve: (m: { default: typeof Probe }) => void = () => {};
		const loader = () =>
			new Promise<{ default: typeof Probe }>((r) => {
				resolve = r;
			});
		mounted = mount(
			<Player
				{...base}
				component={undefined}
				lazyComponent={loader}
				style={{ width: 960 }}
				renderLoading={({ width, height }) => (
					<span data-testid="loading">{`${width}x${height}`}</span>
				)}
			/>,
		);
		expect(document.querySelector("[data-testid=loading]")?.textContent).toBe("960x540");
		await act(async () => {
			resolve({ default: Probe });
		});
		expect(document.querySelector("[data-testid=loading]")).toBeNull();
		expect(shownFrame()).toBe(0);
	});
});
