import { frameStampBlocks } from "@motiojs/testing/frame-stamp";
import { startTransition, useEffect, useState } from "react";
import { delayRender, type FixtureComposition, useCurrentFrame } from "./runtime.tsx";

/** Stamp position shared with the tests through `defaultProps`. */
const STAMP = { x: 16, y: 16, blockSize: 16 };

/** Palette patches: 64 px squares on the 16 px grid, sampled in their centre by the colour test. */
const PATCH = 64;
const PALETTE: [number, number, number][] = [
	[255, 0, 0],
	[0, 255, 0],
	[0, 0, 255],
	[0, 255, 255],
	[255, 0, 255],
	[255, 255, 0],
	[0, 0, 0],
	[255, 255, 255],
	[128, 128, 128],
	[32, 32, 32],
	[224, 224, 224],
	[224, 160, 128],
	[64, 128, 192],
	[128, 128, 0],
	[96, 32, 128],
	[255, 128, 0],
	[0, 128, 128],
	[16, 16, 16],
];
const PALETTE_COLUMNS = 6;

function Stamp({ frame }: { frame: number }) {
	return (
		<>
			<div
				style={{
					position: "absolute",
					left: STAMP.x - 8,
					top: STAMP.y - 8,
					width: 24 * STAMP.blockSize + 16,
					height: STAMP.blockSize + 16,
					background: "#808080",
				}}
			/>
			{frameStampBlocks(frame, STAMP).map((b) => (
				<div
					key={b.x}
					style={{
						position: "absolute",
						left: b.x,
						top: b.y,
						width: b.size,
						height: b.size,
						background: b.on ? "#ffffff" : "#000000",
					}}
				/>
			))}
		</>
	);
}

/** Frame stamp plus animated content: text, a gradient and a rotating box. */
function StampScene() {
	const frame = useCurrentFrame();
	return (
		<div style={{ position: "absolute", inset: 0, background: "#1e2a3a", overflow: "hidden" }}>
			<div
				style={{
					position: "absolute",
					left: 32 + ((frame * 3) % 380),
					top: 96,
					width: 96,
					height: 96,
					borderRadius: 18,
					background: `linear-gradient(${frame % 360}deg, #ff5a36, #3ec9f0)`,
					transform: `rotate(${(frame * 2) % 360}deg)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 32,
					top: 224,
					font: "bold 28px sans-serif",
					color: "#f4f1de",
				}}
			>
				Frame {frame}
			</div>
			<Stamp frame={frame} />
		</div>
	);
}

function PaletteScene() {
	const frame = useCurrentFrame();
	return (
		<div style={{ position: "absolute", inset: 0, background: "#000" }}>
			{PALETTE.map(([r, g, b], i) => (
				<div
					key={`${r}-${g}-${b}`}
					style={{
						position: "absolute",
						left: (i % PALETTE_COLUMNS) * PATCH,
						top: Math.floor(i / PALETTE_COLUMNS) * PATCH,
						width: PATCH,
						height: PATCH,
						background: `rgb(${r}, ${g}, ${b})`,
					}}
				/>
			))}
			<div style={{ position: "absolute", left: 0, top: 3 * PATCH, width: 384, height: 64 }}>
				<Stamp frame={frame} />
			</div>
		</div>
	);
}

/** The stamp is drawn from state set in an effect inside a transition, not from the frame. */
function EffectStateScene() {
	const frame = useCurrentFrame();
	const [shown, setShown] = useState<number | null>(null);
	useEffect(() => {
		startTransition(() => setShown(frame));
	}, [frame]);
	return (
		<div style={{ position: "absolute", inset: 0, background: "#20302a" }}>
			{shown === null ? null : <Stamp frame={shown} />}
		</div>
	);
}

/** Opens a readiness handle that is never released, from frame 2 on. */
function HangScene() {
	const frame = useCurrentFrame();
	useEffect(() => {
		if (frame >= 2) delayRender("fixture: waiting for data that never arrives");
	}, [frame]);
	return <div style={{ position: "absolute", inset: 0, background: "#402020" }} />;
}

/** Throws while rendering from frame 3 on. */
function ThrowScene() {
	const frame = useCurrentFrame();
	if (frame >= 3) throw new Error(`fixture: boom at frame ${frame}`);
	return <div style={{ position: "absolute", inset: 0, background: "#204020" }} />;
}

/** Logs to the console, then throws outside React from a timer at frame 2. */
function UncaughtScene() {
	const frame = useCurrentFrame();
	useEffect(() => {
		console.log(`fixture: rendered frame ${frame}`);
		if (frame === 2) {
			setTimeout(() => {
				throw new Error("fixture: uncaught in a timer");
			}, 0);
		}
	}, [frame]);
	return <div style={{ position: "absolute", inset: 0, background: "#202040" }} />;
}

/** A red square on a transparent background, for alpha capture. */
function AlphaScene() {
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				top: 0,
				width: 32,
				height: 32,
				background: "#ff0000",
			}}
		/>
	);
}

export const compositions: FixtureComposition[] = [
	{
		id: "stamp",
		width: 512,
		height: 288,
		fps: 30,
		durationInFrames: 3000,
		defaultProps: { stamp: STAMP },
		component: StampScene,
		calculateMetadata: (props) =>
			typeof props.durationInFrames === "number"
				? { durationInFrames: props.durationInFrames }
				: {},
	},
	{
		id: "palette",
		width: PALETTE_COLUMNS * PATCH,
		height: 4 * PATCH,
		fps: 25,
		durationInFrames: 50,
		defaultProps: {
			patch: PATCH,
			columns: PALETTE_COLUMNS,
			palette: PALETTE,
			stamp: { ...STAMP, y: 3 * PATCH + STAMP.y },
		},
		component: PaletteScene,
	},
	{
		id: "effect-state",
		width: 416,
		height: 64,
		fps: 30,
		durationInFrames: 120,
		defaultProps: { stamp: STAMP },
		component: EffectStateScene,
	},
	{
		id: "hang",
		width: 128,
		height: 72,
		fps: 30,
		durationInFrames: 10,
		defaultProps: {},
		component: HangScene,
	},
	{
		id: "throws",
		width: 128,
		height: 72,
		fps: 30,
		durationInFrames: 10,
		defaultProps: {},
		component: ThrowScene,
	},
	{
		id: "uncaught",
		width: 128,
		height: 72,
		fps: 30,
		durationInFrames: 10,
		defaultProps: {},
		component: UncaughtScene,
	},
	{
		id: "alpha",
		width: 64,
		height: 64,
		fps: 30,
		durationInFrames: 1,
		defaultProps: {},
		component: AlphaScene,
	},
	{
		id: "odd",
		width: 127,
		height: 72,
		fps: 30,
		durationInFrames: 10,
		defaultProps: {},
		component: ThrowScene,
	},
];
