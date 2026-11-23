import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState } from "react";
import {
	AbsoluteFill,
	Composition,
	cancelRender,
	continueRender,
	delayRender,
	staticFile,
} from "remotion";
import shapes from "./shapes.json";

const size = { width: 640, height: 360, fps: 30 } as const;
const animation = shapes as unknown as LottieAnimationData;

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<AbsoluteFill
		style={{
			background: "linear-gradient(135deg, #fdf6e3, #e3eefd)",
			alignItems: "center",
			justifyContent: "center",
		}}
	>
		{children}
	</AbsoluteFill>
);

// The 25 fps animation as imported JSON, at its own size, default props.
const Shapes: React.FC = () => (
	<Background>
		<Lottie animationData={animation} style={{ width: 400, height: 300 }} />
	</Background>
);

// Looping backward at 1.5x with a class and styles, next to the canvas renderer with a
// slice aspect ratio.
const Options: React.FC = () => (
	<Background>
		<style>{".framed { border: 4px solid #1d2b53; border-radius: 12px; }"}</style>
		<AbsoluteFill
			style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}
		>
			<Lottie
				animationData={animation}
				loop
				direction="backward"
				playbackRate={1.5}
				className="framed"
				style={{ width: 280, height: 210, backgroundColor: "#ffffff" }}
			/>
			{/* lottie-web's canvas renderer sizes its canvas from the container once, on mount, when
			Remotion's composition is not laid out yet: in a flex row it would measure a width of 0.
			A block wrapper keeps the measured size the specified one. */}
			<div style={{ width: 200, height: 260 }}>
				<Lottie
					animationData={animation}
					loop
					playbackRate={0.7}
					renderer="canvas"
					preserveAspectRatio="xMinYMin slice"
					style={{ width: 200, height: 260 }}
				/>
			</div>
		</AbsoluteFill>
	</Background>
);

// Loaded with fetch(staticFile()) as the docs show, placed with the inherited <Sequence> props,
// once with the SVG renderer and once with the HTML one.
const Fetched: React.FC = () => {
	const [handle] = useState(() => delayRender("Loading Lottie animation"));
	const [data, setData] = useState<LottieAnimationData | null>(null);
	useEffect(() => {
		fetch(staticFile("badge.json"))
			.then((response) => response.json())
			.then((json) => {
				setData(json);
				continueRender(handle);
			})
			.catch((err) => cancelRender(err));
	}, [handle]);
	if (!data) return null;
	return (
		<Background>
			<AbsoluteFill
				style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}
			>
				<Lottie
					animationData={data}
					from={10}
					durationInFrames={60}
					style={{ width: 200, height: 200 }}
				/>
				<Lottie
					animationData={data}
					loop
					renderer="html"
					trimBefore={30}
					style={{ width: 160, height: 160 }}
				/>
			</AbsoluteFill>
		</Background>
	);
};

export const Root: React.FC = () => (
	<>
		<Composition id="lottie-shapes" component={Shapes} durationInFrames={90} {...size} />
		<Composition id="lottie-options" component={Options} durationInFrames={90} {...size} />
		<Composition id="lottie-fetched" component={Fetched} durationInFrames={90} {...size} />
	</>
);
