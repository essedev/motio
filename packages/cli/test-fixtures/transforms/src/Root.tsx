import type React from "react";
import {
	AbsoluteFill,
	Composition,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

// Elements whose CSS transform changes on every frame. The pixels of a frame must not depend on
// the frames the same page rendered before it (ARCHITECTURE, "Raster reset" in the Motio repo):
// Blink skips the raster invalidation of transform changes below a tolerance, and keeps the
// raster scale of `will-change: transform` layers, so without a reset a frame shows content
// rasterised for an earlier frame.

const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#ffb000"/><path d="M28 64 L50 30 L72 64 Z" fill="#101820"/></svg>',
)}`;

const centred = {
	backgroundColor: "#101820",
	justifyContent: "center",
	alignItems: "center",
} as const;

/** A spring from 0 that overshoots and settles in steps far below 1e-4: the starter's logo. */
const ScaleFromZero: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const pop = spring({ frame, fps });
	return (
		<AbsoluteFill style={centred}>
			<img src={LOGO} alt="" style={{ width: 220, height: 220, transform: `scale(${pop})` }} />
			<div
				style={{
					color: "white",
					fontSize: 64,
					fontWeight: 700,
					fontFamily: "sans-serif",
					transform: `scale(${pop})`,
				}}
			>
				Made with Motio
			</div>
		</AbsoluteFill>
	);
};

/** Opacity and a scale from 0.85: the starter's title, without `will-change`. */
const ScaleNearOne: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 200 } });
	return (
		<AbsoluteFill style={centred}>
			<h1
				style={{
					color: "white",
					fontSize: 72,
					fontFamily: "sans-serif",
					margin: 0,
					opacity: enter,
					transform: `scale(${interpolate(enter, [0, 1], [0.85, 1])})`,
				}}
			>
				Hello, Motio
			</h1>
		</AbsoluteFill>
	);
};

/** Rotation and translation with subpixel values, combined with a scale. */
const RotateTranslate: React.FC = () => {
	const frame = useCurrentFrame();
	const angle = interpolate(frame, [0, 59], [-17.3, 23.9]);
	const x = interpolate(frame, [0, 59], [-80.37, 113.61]);
	const y = Math.sin(frame / 7) * 21.13;
	const s = interpolate(frame, [0, 59], [0.31, 1.07]);
	return (
		<AbsoluteFill style={{ backgroundColor: "#1e2a3a" }}>
			<div
				style={{
					position: "absolute",
					left: 220,
					top: 110,
					width: 200,
					height: 120,
					borderRadius: 16,
					background: "linear-gradient(135deg, #ff5a36, #3ec9f0)",
					transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${s})`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 60,
					top: 260,
					color: "#f4f1de",
					fontSize: 40,
					fontFamily: "sans-serif",
					transform: `translate(${x / 3}px, ${y / 2}px) rotate(${-angle / 2}deg) scale(${s})`,
				}}
			>
				Subpixel motion
			</div>
		</AbsoluteFill>
	);
};

/** A box whose scale grows by 5e-5 per frame: every step is below Blink's tolerance. */
const TinySteps: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={centred}>
			<div
				style={{
					width: 221,
					height: 141,
					background: "#ff5a36",
					transform: `scale(${1 + frame * 5e-5}) translateX(${frame * 0.004}px)`,
				}}
			/>
		</AbsoluteFill>
	);
};

/** Translation only, in steps of 0.004 px (below Blink's 0.01 px tolerance) from a subpixel offset. */
const SubpixelTranslate: React.FC = () => {
	const frame = useCurrentFrame();
	const x = 0.37 + frame * 0.004;
	const y = 0.21 + frame * 0.0031;
	return (
		<AbsoluteFill style={centred}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 24,
					transform: `translate(${x}px, ${y}px)`,
				}}
			>
				<div style={{ width: 93, height: 61, background: "#3ec9f0", borderRadius: 9 }} />
				<div style={{ color: "white", fontSize: 44, fontFamily: "sans-serif" }}>
					Drifting slowly
				</div>
			</div>
		</AbsoluteFill>
	);
};

/** Text scaled from 0 on its own layer: Chrome keeps the raster scale of the first frame drawn. */
const WillChange: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const pop = spring({ frame, fps });
	return (
		<AbsoluteFill style={centred}>
			<div
				style={{
					color: "white",
					fontSize: 64,
					fontFamily: "sans-serif",
					transform: `scale(${pop})`,
					willChange: "transform",
				}}
			>
				Made with Motio
			</div>
		</AbsoluteFill>
	);
};

const size = { width: 640, height: 360, fps: 30, durationInFrames: 60 } as const;

export const Root: React.FC = () => (
	<>
		<Composition id="scale-from-zero" component={ScaleFromZero} {...size} />
		<Composition id="scale-near-one" component={ScaleNearOne} {...size} />
		<Composition id="rotate-translate" component={RotateTranslate} {...size} />
		<Composition id="tiny-steps" component={TinySteps} {...size} />
		<Composition id="subpixel-translate" component={SubpixelTranslate} {...size} />
		<Composition id="will-change" component={WillChange} {...size} />
	</>
);
