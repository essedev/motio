import {
	linearTiming,
	makeHtmlInCanvasPresentation,
	springTiming,
	type TransitionPresentation,
	TransitionSeries,
} from "@remotion/transitions";
import { blurSlide } from "@remotion/transitions/blur-slide";
import { bookFlip } from "@remotion/transitions/book-flip";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { dissolve } from "@remotion/transitions/dissolve";
import { dreamyZoom } from "@remotion/transitions/dreamy-zoom";
import { fade } from "@remotion/transitions/fade";
import { filmBurn } from "@remotion/transitions/film-burn";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { ripple } from "@remotion/transitions/ripple";
import { slide } from "@remotion/transitions/slide";
import { swap } from "@remotion/transitions/swap";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { zoomInOut } from "@remotion/transitions/zoom-in-out";
import { AbsoluteFill, Composition } from "remotion";
import { crossfadeShader } from "./custom-shader";

const size = { width: 320, height: 180, fps: 30 } as const;

// The exiting scene: a gradient, a letter and a box near a corner, so that zooms, rotations and
// wrapping show.
const SceneA: React.FC = () => (
	<AbsoluteFill
		style={{
			background: "linear-gradient(135deg, #0b84f3, #12355b)",
			justifyContent: "center",
			alignItems: "center",
			fontSize: 110,
			color: "white",
			fontFamily: "sans-serif",
		}}
	>
		A
		<div
			style={{
				position: "absolute",
				left: 20,
				top: 20,
				width: 60,
				height: 30,
				background: "#ffcc00",
			}}
		/>
	</AbsoluteFill>
);

// The entering scene, slightly transparent (opacity 0.9) like the documentation's examples.
const SceneB: React.FC = () => (
	<AbsoluteFill
		style={{
			backgroundColor: "pink",
			opacity: 0.9,
			justifyContent: "center",
			alignItems: "center",
			fontSize: 110,
			color: "#5a1a3a",
			fontFamily: "serif",
		}}
	>
		B
		<div
			style={{
				position: "absolute",
				right: 24,
				bottom: 18,
				width: 40,
				height: 40,
				borderRadius: 20,
				background: "#2ecc71",
			}}
		/>
	</AbsoluteFill>
);

const Letter: React.FC<{ color: string; children: string }> = ({ color, children }) => (
	<AbsoluteFill
		style={{
			backgroundColor: color,
			justifyContent: "center",
			alignItems: "center",
			fontSize: 90,
			color: "white",
			fontFamily: "sans-serif",
		}}
	>
		{children}
	</AbsoluteFill>
);

const custom = makeHtmlInCanvasPresentation(crossfadeShader);

// One transition of 30 frames between A (frames 0 to 39) and B (from frame 10).
const presentations: Record<string, () => TransitionPresentation<Record<string, unknown>>> = {
	custom: () => custom({}),
	"zoom-in-out": () => zoomInOut({}),
	dissolve: () => dissolve({}),
	"dissolve-options": () =>
		dissolve({
			lineWidth: 0.3,
			spreadColor: "#00ff88",
			hotColor: "#ffffff",
			pow: 2,
			intensity: 1.5,
		}),
	swap: () => swap({}),
	"swap-options": () => swap({ reflection: 0.8, perspective: 0.5, depth: 2 }),
	"blur-slide": () => blurSlide({}),
	"blur-slide-right": () => blurSlide({ direction: "from-right", blur: 0.3 }),
	"blur-slide-top": () => blurSlide({ direction: "from-top" }),
	"blur-slide-bottom": () => blurSlide({ direction: "from-bottom", blur: 1 }),
	"book-flip": () => bookFlip({}),
	"book-flip-left": () => bookFlip({ direction: "from-left" }),
	"book-flip-top": () => bookFlip({ direction: "from-top" }),
	"book-flip-bottom": () => bookFlip({ direction: "from-bottom" }),
	crosswarp: () => crosswarp({}),
	"cross-zoom": () => crossZoom({}),
	"cross-zoom-options": () => crossZoom({ strength: 0.8 }),
	"dreamy-zoom": () => dreamyZoom({}),
	"dreamy-zoom-options": () => dreamyZoom({ rotation: 20, scale: 2 }),
	"film-burn": () => filmBurn({}),
	"film-burn-options": () => filmBurn({ seed: 7 }),
	"linear-blur": () => linearBlur({}),
	"linear-blur-options": () => linearBlur({ intensity: 0.4 }),
	ripple: () => ripple({}),
	"ripple-options": () => ripple({ amplitude: 30, speed: 10 }),
	"zoom-blur": () => zoomBlur({}),
	"zoom-blur-options": () => zoomBlur({ rotation: 1 }),
};

const between = (presentation: () => TransitionPresentation<Record<string, unknown>>) => {
	const Component: React.FC = () => (
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={40}>
				<SceneA />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition
				presentation={presentation()}
				timing={linearTiming({ durationInFrames: 30 })}
			/>
			<TransitionSeries.Sequence durationInFrames={40}>
				<SceneB />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	);
	return Component;
};

// Transitions before the first scene and after the last do not change it.
const Ends: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Transition
			presentation={crosswarp({})}
			timing={linearTiming({ durationInFrames: 20 })}
		/>
		<TransitionSeries.Sequence durationInFrames={40}>
			<Letter color="#0b84f3">A</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={zoomInOut({})}
			timing={linearTiming({ durationInFrames: 20 })}
		/>
	</TransitionSeries>
);

// CSS and canvas presentations next to each other, one with a spring timing.
const Mixed: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={30}>
			<Letter color="#0b84f3">A</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={fade()}
			timing={linearTiming({ durationInFrames: 10 })}
		/>
		<TransitionSeries.Sequence durationInFrames={30}>
			<Letter color="#e67e22">B</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={crosswarp({})}
			timing={springTiming({ durationInFrames: 14 })}
		/>
		<TransitionSeries.Sequence durationInFrames={30}>
			<Letter color="#8e44ad">C</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={slide({ direction: "from-right" })}
			timing={linearTiming({ durationInFrames: 10 })}
		/>
		<TransitionSeries.Sequence durationInFrames={30}>
			<Letter color="#16a085">D</Letter>
		</TransitionSeries.Sequence>
	</TransitionSeries>
);

// Two canvas presentations in a row: the middle scene enters through one and exits through the
// other.
const Chain: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={20}>
			<Letter color="#0b84f3">A</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={dissolve({})}
			timing={linearTiming({ durationInFrames: 10 })}
		/>
		<TransitionSeries.Sequence durationInFrames={25}>
			<Letter color="#e67e22">B</Letter>
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={crosswarp({})}
			timing={linearTiming({ durationInFrames: 10 })}
		/>
		<TransitionSeries.Sequence durationInFrames={20}>
			<Letter color="#8e44ad">C</Letter>
		</TransitionSeries.Sequence>
	</TransitionSeries>
);

export const Root: React.FC = () => (
	<>
		{Object.entries(presentations).map(([id, presentation]) => (
			<Composition
				key={id}
				id={id}
				component={between(presentation)}
				{...size}
				durationInFrames={50}
			/>
		))}
		<Composition id="ends" component={Ends} {...size} durationInFrames={40} />
		<Composition id="mixed" component={Mixed} {...size} durationInFrames={90} />
		<Composition id="chain" component={Chain} {...size} durationInFrames={50} />
	</>
);
