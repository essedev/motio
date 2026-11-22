// Browser entry of the Player integration tests: mounts a Player and exposes a small API on
// `window.__playerTest` that the tests drive through puppeteer.
import {
	AbsoluteFill,
	getRemotionEnvironment,
	useBufferState,
	useCurrentFrame,
	useCurrentScale,
} from "@motiojs/core";
import { createRef, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "../player.js";
import type { PlayerEventTypes, PlayerProps, PlayerRef } from "../types.js";

let blocked = false;
const blockListeners = new Set<() => void>();
const subscribeBlock = (l: () => void) => {
	blockListeners.add(l);
	return () => blockListeners.delete(l);
};

/** Shows the frame as text and holds a buffer handle while the test blocks it. */
function Stamp() {
	const frame = useCurrentFrame();
	const scale = useCurrentScale();
	const block = useSyncExternalStore(subscribeBlock, () => blocked);
	const buffer = useBufferState();
	useEffect(() => {
		if (!block) return;
		const handle = buffer.delayPlayback();
		return () => handle.unblock();
	}, [block, buffer]);
	return (
		<AbsoluteFill
			style={{ background: "#123", color: "white", fontSize: 200 }}
			data-stamp=""
			data-frame={frame}
			data-scale={scale}
			data-is-player={String(getRemotionEnvironment().isPlayer)}
		>
			{frame}
		</AbsoluteFill>
	);
}

interface RecordedEvent {
	name: keyof PlayerEventTypes;
	detail: unknown;
	t: number;
}

const EVENTS: (keyof PlayerEventTypes)[] = [
	"play",
	"pause",
	"ended",
	"seeked",
	"timeupdate",
	"frameupdate",
	"ratechange",
	"scalechange",
	"waiting",
	"resume",
	"error",
];

const host = document.createElement("div");
host.id = "host";
document.body.appendChild(host);
const root = createRoot(host);
const ref = createRef<PlayerRef>();
const events: RecordedEvent[] = [];

function mountPlayer(props: Partial<PlayerProps> = {}): void {
	events.length = 0;
	root.render(
		<Player
			ref={ref}
			component={Stamp}
			durationInFrames={300}
			fps={30}
			compositionWidth={1920}
			compositionHeight={1080}
			style={{ width: 480 }}
			{...(props as object)}
		/>,
	);
}

function attachListeners(): void {
	const player = ref.current;
	if (!player) throw new Error("The Player is not mounted");
	for (const name of EVENTS) {
		player.addEventListener(name, (e) =>
			events.push({ name, detail: e.detail ?? null, t: performance.now() }),
		);
	}
}

function setBlocked(value: boolean): void {
	blocked = value;
	for (const l of blockListeners) l();
}

const api = {
	mount: (props?: Partial<PlayerProps>) =>
		new Promise<void>((resolve) => {
			mountPlayer(props);
			const wait = () => {
				if (ref.current && document.querySelector("[data-stamp]")) {
					attachListeners();
					resolve();
				} else requestAnimationFrame(wait);
			};
			wait();
		}),
	unmount: () => root.render(null),
	player: () => {
		if (!ref.current) throw new Error("The Player is not mounted");
		return ref.current;
	},
	events,
	setBlocked,
	stampFrame: () => Number(document.querySelector<HTMLElement>("[data-stamp]")?.dataset.frame),
	stamp: () => {
		const el = document.querySelector<HTMLElement>("[data-stamp]");
		return el ? { ...el.dataset } : null;
	},
	nextFrame: () => new Promise<void>((r) => requestAnimationFrame(() => r())),
};

(window as unknown as { __playerTest: typeof api }).__playerTest = api;
document.body.dataset.ready = "true";
