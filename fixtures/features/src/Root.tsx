import { noise2D } from "@remotion/noise";
import { evolvePath, interpolatePath } from "@remotion/paths";
import { Circle, Ellipse, Pie, Polygon, Rect, Star, Triangle } from "@remotion/shapes";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
	AbsoluteFill,
	Composition,
	continueRender,
	delayRender,
	interpolate,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";

const handle = delayRender("Loading Inter");
const face = new FontFace("Inter", `url(${staticFile("inter-700.woff2")})`, { weight: "700" });
face.load().then((f) => {
	document.fonts.add(f);
	continueRender(handle);
});

const size = { width: 640, height: 360, fps: 30 } as const;

const Panel: React.FC<{ color: string; label: string }> = ({ color, label }) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: color,
				justifyContent: "center",
				alignItems: "center",
				fontFamily: "Inter",
				fontWeight: 700,
				fontSize: 64,
				color: "white",
			}}
		>
			{`${label} ${frame}`}
		</AbsoluteFill>
	);
};

/** Every common presentation in one TransitionSeries, linear and spring timings. */
const Transitions: React.FC = () => {
	const { width, height } = useVideoConfig();
	return (
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#b91c1c" label="A" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={fade()}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#15803d" label="B" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={slide({ direction: "from-right" })}
				timing={springTiming({ config: { damping: 200 }, durationInFrames: 12 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#1d4ed8" label="C" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={wipe({ direction: "from-top-left" })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#7e22ce" label="D" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={flip({ direction: "from-left" })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#c2410c" label="E" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={clockWipe({ width, height })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#0f766e" label="F" />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={iris({ width, height })}
				timing={linearTiming({ durationInFrames: 10 })}
			/>
			<TransitionSeries.Sequence durationInFrames={30}>
				<Panel color="#be185d" label="G" />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	);
};

/** The shape components with animated parameters. */
const Shapes: React.FC = () => {
	const frame = useCurrentFrame();
	const p = interpolate(frame, [0, 59], [0, 1]);
	return (
		<AbsoluteFill
			style={{
				backgroundColor: "#111827",
				flexDirection: "row",
				flexWrap: "wrap",
				gap: 20,
				padding: 30,
				alignItems: "center",
			}}
		>
			<Star points={5 + Math.floor(p * 4)} innerRadius={30} outerRadius={60} fill="#facc15" />
			<Circle radius={50} fill="#38bdf8" stroke="white" strokeWidth={4} />
			<Ellipse rx={70} ry={40} fill="#f472b6" />
			<Triangle length={100} direction="up" fill="#34d399" cornerRadius={8} />
			<Pie radius={50} progress={p} fill="#fb923c" closePath />
			<Rect width={120} height={70} cornerRadius={14} fill="#a78bfa" />
			<Polygon points={6} radius={50} fill="#f87171" cornerRadius={6} />
		</AbsoluteFill>
	);
};

const A = "M 50 180 C 120 40, 240 40, 300 180 S 480 320, 590 180";
const B = "M 50 120 C 150 300, 250 300, 320 120 S 500 -60, 590 220";

/** evolvePath stroke drawing and interpolatePath morphing. */
const Paths: React.FC = () => {
	const frame = useCurrentFrame();
	const p = interpolate(frame, [0, 59], [0, 1]);
	const evolved = evolvePath(p, A);
	return (
		<AbsoluteFill style={{ backgroundColor: "#fefce8" }}>
			<svg width={640} height={360} viewBox="0 0 640 360" aria-hidden="true">
				<path
					d={A}
					fill="none"
					stroke="#1e3a8a"
					strokeWidth={10}
					strokeDasharray={evolved.strokeDasharray}
					strokeDashoffset={evolved.strokeDashoffset}
				/>
				<path d={interpolatePath(p, A, B)} fill="none" stroke="#b91c1c" strokeWidth={4} />
			</svg>
		</AbsoluteFill>
	);
};

/** A field of dots displaced by 2D noise. */
const Noise: React.FC = () => {
	const frame = useCurrentFrame();
	const dots: React.ReactNode[] = [];
	for (let y = 0; y < 9; y++) {
		for (let x = 0; x < 16; x++) {
			const dx = noise2D("x", x / 5, frame / 30 + y / 5) * 14;
			const dy = noise2D("y", y / 5, frame / 30 + x / 5) * 14;
			dots.push(
				<div
					key={`${x}-${y}`}
					style={{
						position: "absolute",
						left: 20 + x * 38 + dx,
						top: 20 + y * 38 + dy,
						width: 12,
						height: 12,
						borderRadius: 6,
						background: "#0ea5e9",
					}}
				/>,
			);
		}
	}
	return <AbsoluteFill style={{ backgroundColor: "#082f49" }}>{dots}</AbsoluteFill>;
};

export const Root: React.FC = () => (
	<>
		<Composition id="transitions" component={Transitions} durationInFrames={148} {...size} />
		<Composition id="shapes" component={Shapes} durationInFrames={60} {...size} />
		<Composition id="paths" component={Paths} durationInFrames={60} {...size} />
		<Composition id="noise" component={Noise} durationInFrames={60} {...size} />
	</>
);
