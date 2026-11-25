import { useEffect, useRef, useState } from "react";
import { AbsoluteFill } from "remotion";

// Animation loops on timers instead of animation frames, as libraries without requestAnimationFrame
// (or with a timer fallback) run them: a setTimeout(0) chain that moves a box and redraws a canvas,
// and a setInterval that updates React state. On the real clock in the frame model, what they draw
// differs between renders; the virtual time model replays them on the video's time.

type Props = { canvas: boolean; box: boolean; interval: boolean };

function TimeoutChain({ canvas, box: moveBox }: Pick<Props, "canvas" | "box">) {
	const box = useRef<HTMLDivElement>(null);
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const ctx = canvas ? ref.current?.getContext("2d") : null;
		let x = 0;
		let id = 0;
		const tick = () => {
			x = (x + 3) % 280;
			if (moveBox && box.current) box.current.style.transform = `translateX(${x}px)`;
			if (ctx) {
				ctx.fillStyle = "rgba(16, 24, 32, 0.2)";
				ctx.fillRect(0, 0, 320, 120);
				for (let i = 0; i < 400; i++) {
					ctx.fillStyle = `hsl(${(x + i) % 360}deg 80% 60%)`;
					ctx.fillRect((x * 7 + i * 13) % 320, (i * 7) % 120, 3, 3);
				}
			}
			id = window.setTimeout(tick, 0);
		};
		id = window.setTimeout(tick, 0);
		return () => clearTimeout(id);
	}, [canvas, moveBox]);
	return (
		<>
			{canvas ? (
				<canvas ref={ref} width={320} height={120} style={{ position: "absolute", top: 40 }} />
			) : null}
			<div
				ref={box}
				style={{ position: "absolute", top: 10, width: 20, height: 20, background: "#3fa7ff" }}
			/>
		</>
	);
}

function IntervalState() {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setCount((c) => c + 1), 1);
		return () => clearInterval(id);
	}, []);
	return (
		<div
			style={{
				position: "absolute",
				top: 165,
				height: 10,
				width: (count * 5) % 320,
				background: "#ffb000",
			}}
		/>
	);
}

export function TimerLoop({ canvas, box, interval }: Props) {
	return (
		<AbsoluteFill style={{ background: "#202830" }}>
			<TimeoutChain canvas={canvas} box={box} />
			{interval ? <IntervalState /> : null}
		</AbsoluteFill>
	);
}
