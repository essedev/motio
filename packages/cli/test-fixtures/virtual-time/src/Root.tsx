import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Composition, useCurrentFrame } from "remotion";
import { CssTransition } from "./css-transition";
import { TimeZone, timeZoneMetadata } from "./time-zone";
import { Timeline } from "./tiny-timeline";

// Third-party-style code that reads the clock instead of the frame: deterministic only in the
// virtual time model (ARCHITECTURE, "Time" in the Motio repository), where every page steps
// through every frame from frame 0. In the frame model each panel follows the real clock.

/** Tweens driven by a ticker on requestAnimationFrame, as GSAP timelines are. */
function TimelinePanel() {
	const box = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const tl = new Timeline(el)
			.to({ x: 90, rotate: 90, hue: 120 }, 0.6)
			.to({ y: 40, scale: 0.6, hue: 240 }, 0.4)
			.to({ x: 0, y: 0, rotate: 0, scale: 1, hue: 0 }, 0.5);
		return () => tl.kill();
	}, []);
	return (
		<div style={{ position: "absolute", left: 10, top: 10, width: 140, height: 75 }}>
			<div
				ref={box}
				style={{ width: 28, height: 28, borderRadius: 6, background: "hsl(0deg 80% 55%)" }}
			/>
		</div>
	);
}

/** Particles integrated with the time between animation frames, spawned with Math.random. */
function CanvasLoopPanel() {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const ctx = canvas.current?.getContext("2d");
		if (!ctx) return;
		const particles: { x: number; y: number; vx: number; vy: number; hue: number }[] = [];
		let last = performance.now();
		let id = 0;
		const loop = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			particles.push({
				x: 70,
				y: 70,
				vx: (Math.random() - 0.5) * 120,
				vy: -40 - Math.random() * 60,
				hue: Math.random() * 360,
			});
			if (particles.length > 40) particles.shift();
			ctx.fillStyle = "rgba(16, 24, 32, 0.35)";
			ctx.fillRect(0, 0, 140, 75);
			for (const p of particles) {
				p.vy += 90 * dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				ctx.fillStyle = `hsl(${p.hue}deg 90% 60%)`;
				ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
			}
			id = requestAnimationFrame(loop);
		};
		id = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(id);
	}, []);
	return (
		<canvas
			ref={canvas}
			width={140}
			height={75}
			style={{ position: "absolute", left: 170, top: 10, background: "#101820" }}
		/>
	);
}

/** A counter incremented by setInterval, shown as bars. */
function IntervalPanel() {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setCount((c) => c + 1), 70);
		return () => clearInterval(id);
	}, []);
	return (
		<div style={{ position: "absolute", left: 10, top: 95, width: 140, height: 75 }}>
			{Array.from({ length: 5 }, (_, i) => (
				<div
					key={i}
					style={{
						height: 12,
						marginBottom: 3,
						width: ((count * (i + 1) * 7) % 140) + 2,
						background: `hsl(${(count * 25 + i * 60) % 360}deg 70% 50%)`,
					}}
				/>
			))}
		</div>
	);
}

/** Motion computed from Date: a clock hand and a box sliding since the component mounted. */
function DatePanel() {
	useCurrentFrame(); // Re-renders on every frame; the motion itself reads Date.
	const mounted = useRef(Date.now());
	const now = new Date();
	const seconds = now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;
	const elapsed = (Date.now() - mounted.current) / 1000;
	return (
		<div style={{ position: "absolute", left: 170, top: 95, width: 140, height: 75 }}>
			<div
				style={{
					position: "absolute",
					left: 30,
					top: 10,
					width: 2,
					height: 30,
					background: "#ffb000",
					transformOrigin: "50% 100%",
					transform: `rotate(${seconds * 36}deg)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 60 + ((elapsed * 45) % 70),
					top: 50,
					width: 14,
					height: 14,
					background: "#3fa7ff",
				}}
			/>
		</div>
	);
}

/** Colours drawn with Math.random while the frame renders. */
function RandomPanel() {
	useCurrentFrame();
	return (
		<div style={{ position: "absolute", left: 10, top: 172, display: "flex", gap: 2 }}>
			{Array.from({ length: 12 }, (_, i) => (
				<div
					key={i}
					style={{
						width: 24,
						height: 6,
						background: `hsl(${Math.floor(Math.random() * 360)}deg 80% 50%)`,
					}}
				/>
			))}
		</div>
	);
}

/**
 * `canvas: false` leaves the canvas panel out. Drawn on the GPU (`canvas: "gpu"`), its
 * accumulated semi-transparent drawing can come out different under heavy load (measured at load
 * 30 to 43: 7 of 360 frames, all inside the canvas), in either time model; Motio's default draws
 * transparent captures' canvases in software, where it does not (0 of 1,140 frames at load 34 to
 * 90).
 */
function ClockDriven({ canvas }: { canvas: boolean }) {
	return (
		<AbsoluteFill style={{ background: "#202830" }}>
			<TimelinePanel />
			{canvas ? <CanvasLoopPanel /> : null}
			<IntervalPanel />
			<DatePanel />
			<RandomPanel />
		</AbsoluteFill>
	);
}

export function Root() {
	return (
		<>
			<Composition
				id="clock-driven"
				component={ClockDriven}
				width={320}
				height={180}
				fps={30}
				durationInFrames={60}
				defaultProps={{ canvas: true }}
				timeModel="virtual"
			/>
			<Composition
				id="css-transition"
				component={CssTransition}
				width={320}
				height={180}
				fps={30}
				durationInFrames={60}
			/>
			<Composition
				id="time-zone"
				component={TimeZone}
				width={320}
				height={40}
				fps={30}
				durationInFrames={4}
				defaultProps={{ zone: "", hour: -1, workerZone: "" }}
				calculateMetadata={timeZoneMetadata}
			/>
		</>
	);
}
