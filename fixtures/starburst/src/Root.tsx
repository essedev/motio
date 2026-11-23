import { Starburst } from "@remotion/starburst";
import { AbsoluteFill, Composition, interpolate, useCurrentFrame } from "remotion";

const size = { width: 480, height: 270, fps: 30, durationInFrames: 60 } as const;

// The documented example, turning once over the composition, on black.
const Rotating: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: "black" }}>
			<Starburst
				rays={16}
				colors={["#ffdd00", "#ff8800", "#ff4400"]}
				rotation={interpolate(frame, [0, 59], [0, 360])}
				smoothness={0.1}
			/>
		</AbsoluteFill>
	);
};

const quarter = (left: number, top: number) => ({ left, top }) as const;

// Four canvases of 240 by 135: odd and fractional ray counts, soft edges, a moved origin, a
// vignette over white, 100 rays of every color syntax.
const Options: React.FC = () => (
	<AbsoluteFill style={{ backgroundColor: "white" }}>
		<Starburst rays={5} colors={["#e63946", "#1d3557"]} width={240} height={135} />
		<Starburst
			rays={7.3}
			colors={["#ff0000", "#00ff00", "#0000ff"]}
			smoothness={0.4}
			originOffsetX={0.2}
			originOffsetY={0.3}
			rotation={-20}
			width={240}
			height={135}
			style={quarter(240, 0)}
		/>
		<Starburst
			rays={6}
			colors={["#ff8800", "#3366cc", "#22aa55"]}
			smoothness={0.6}
			vignette={0.3}
			width={240}
			height={135}
			style={quarter(0, 135)}
		/>
		<Starburst
			rays={100}
			colors={[
				"hsl(30, 80%, 50%)",
				"#abc",
				"rebeccapurple",
				"rgba(0, 128, 0, 0.4)",
				"#11223344",
				"transparent",
				"rgb(240, 200, 10)",
			]}
			smoothness={0.2}
			rotation={725}
			width={240}
			height={135}
			style={quarter(240, 135)}
		/>
	</AbsoluteFill>
);

// <Sequence> props: shown from frame 10 for 20 frames, over a checkerboard, half transparent and
// turned by CSS; a second burst sized only in width, with a strong vignette.
const Timing: React.FC = () => (
	<AbsoluteFill
		style={{
			backgroundColor: "#f4f1ea",
			backgroundImage:
				"linear-gradient(45deg, #d9d4c7 25%, transparent 25%, transparent 75%, #d9d4c7 75%), linear-gradient(45deg, #d9d4c7 25%, transparent 25%, transparent 75%, #d9d4c7 75%)",
			backgroundSize: "40px 40px",
			backgroundPosition: "0 0, 20px 20px",
		}}
	>
		<Starburst
			from={10}
			durationInFrames={20}
			rays={8}
			colors={["#7b2cbf", "#ffd60a"]}
			width={200}
			height={200}
			className="burst"
			style={{ left: 30, top: 35, opacity: 0.6, transform: "rotate(12deg)" }}
		/>
		<Starburst
			rays={12}
			colors={["#0077b6", "#90e0ef"]}
			vignette={0.12}
			smoothness={0.3}
			width={220}
			style={{ left: 250 }}
		/>
	</AbsoluteFill>
);

// A wide strip at the defaults: the default vignette of 1 fades its ends.
const Wide: React.FC = () => <Starburst rays={12} colors={["#ffffff", "#ff006e"]} />;

export const Root: React.FC = () => (
	<>
		<Composition id="starburst-rotating" component={Rotating} {...size} />
		<Composition id="starburst-options" component={Options} {...size} />
		<Composition id="starburst-timing" component={Timing} {...size} />
		<Composition
			id="starburst-wide"
			component={Wide}
			width={960}
			height={200}
			fps={30}
			durationInFrames={10}
		/>
	</>
);
