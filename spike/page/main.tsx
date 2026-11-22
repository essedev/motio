import { createContext, useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

const FPS = 30;
const FrameContext = createContext(0);
const useCurrentFrame = () => useContext(FrameContext);

declare global {
	interface Window {
		__motioClock?: {
			native: {
				setTimeout: typeof setTimeout;
				requestAnimationFrame: typeof requestAnimationFrame;
			};
			now: number;
			setFrame(frame: number, fps: number): void;
			runDue(wrap: (fn: () => void) => void): void;
		};
		__motio: { seek(frame: number): Promise<Record<string, unknown>> };
	}
}

const clock = window.__motioClock;
const nativeSetTimeout = clock?.native.setTimeout ?? window.setTimeout.bind(window);

const tile = (i: number) => ({ left: (i % 4) * 320, top: Math.floor(i / 4) * 360 });

// F0: hook-driven, deterministic by construction.
function HookTile() {
	const frame = useCurrentFrame();
	return (
		<div className="tile" style={tile(0)}>
			<div className="dot" style={{ left: (frame * 4) % 260, top: 100 }} />
		</div>
	);
}

// F1: state derived in an effect from the frame (React effect timing).
function EffectTile() {
	const frame = useCurrentFrame();
	const [x, setX] = useState(0);
	useEffect(() => setX((frame * 7) % 260), [frame]);
	return (
		<div className="tile" style={tile(1)}>
			<div className="dot" style={{ left: x, top: 100 }} data-probe="effect" data-value={x} />
		</div>
	);
}

// F2: CSS keyframes animation.
function CssTile() {
	return (
		<div className="tile" style={tile(2)}>
			<div className="dot css-anim" style={{ top: 100 }} />
		</div>
	);
}

// F3: Web Animations API.
function WaapiTile() {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const a = ref.current?.animate(
			[{ transform: "translateY(0px)" }, { transform: "translateY(260px)" }],
			{ duration: 1500, iterations: Number.POSITIVE_INFINITY },
		);
		return () => a?.cancel();
	}, []);
	return (
		<div className="tile" style={tile(3)}>
			<div ref={ref} className="dot" style={{ left: 140 }} />
		</div>
	);
}

// F4: rAF loop drawing on a canvas from performance.now().
function RafTile() {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let id = 0;
		const draw = () => {
			const ctx = ref.current?.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, 320, 360);
				ctx.fillStyle = "#33e";
				ctx.fillRect((performance.now() / 5) % 280, 150, 40, 40);
			}
			id = requestAnimationFrame(draw);
		};
		id = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(id);
	}, []);
	return <canvas ref={ref} width={320} height={360} className="tile" style={tile(4)} />;
}

// F5: setInterval-driven React state.
function IntervalTile() {
	const [n, setN] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setN((v) => v + 1), 100);
		return () => clearInterval(id);
	}, []);
	return (
		<div className="tile" style={tile(5)}>
			<div
				className="dot"
				style={{ left: (n * 10) % 260, top: 100 }}
				data-probe="interval"
				data-value={n}
			/>
		</div>
	);
}

// F6: Math.random during render.
function RandomTile() {
	useCurrentFrame();
	const r = Math.random();
	return (
		<div className="tile" style={tile(6)}>
			<div
				className="dot"
				style={{ left: r * 260, top: 100 }}
				data-probe="random"
				data-value={r.toFixed(6)}
			/>
		</div>
	);
}

// F7: Date.now() during render.
function DateTile() {
	useCurrentFrame();
	const ms = Date.now() % 10000;
	return (
		<div className="tile" style={tile(7)}>
			<div
				className="dot"
				style={{ left: (ms / 40) % 260, top: 100 }}
				data-probe="date"
				data-value={ms}
			/>
		</div>
	);
}

function App({ frame }: { frame: number }) {
	return (
		<FrameContext.Provider value={frame}>
			<HookTile />
			<EffectTile />
			<CssTile />
			<WaapiTile />
			<RafTile />
			<IntervalTile />
			<RandomTile />
			<DateTile />
		</FrameContext.Provider>
	);
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("no root");
const root = createRoot(rootEl);
const macrotask = () => new Promise<void>((r) => nativeSetTimeout(r, 0));
const params = new URLSearchParams(location.search);
const seekAnimations = params.has("seekanim");

window.__motio = {
	async seek(frame: number) {
		const t0 = performance.now === undefined ? 0 : Date.now();
		const timeMs = (frame / FPS) * 1000;
		clock?.setFrame(frame, FPS);
		flushSync(() => root.render(<App frame={frame} />));
		clock?.runDue((fn) => flushSync(fn));
		if (seekAnimations) {
			for (const a of document.getAnimations()) {
				a.pause();
				a.currentTime = timeMs;
			}
		}
		await document.fonts.ready;
		await macrotask();
		const probes: Record<string, string | null> = {};
		for (const el of document.querySelectorAll<HTMLElement>("[data-probe]"))
			probes[el.dataset.probe ?? ""] = el.dataset.value ?? null;
		return { frame, probes, seekMs: Date.now() - t0 };
	},
};
