import { AbsoluteFill, Composition, interpolate, staticFile, useCurrentFrame } from "remotion";

const Hello = ({ title }: { title: string }) => {
	const frame = useCurrentFrame();
	const left = interpolate(frame, [0, 29], [0, 280], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ backgroundColor: "rgb(20, 40, 80)" }}>
			<div
				style={{
					position: "absolute",
					left,
					top: 70,
					width: 40,
					height: 40,
					backgroundImage: `url(${staticFile("dot.svg")})`,
				}}
			/>
			<div style={{ color: "white", fontSize: 12, fontFamily: "sans-serif" }}>
				{title} {process.env.REMOTION_TAG ?? ""}
			</div>
		</AbsoluteFill>
	);
};

export const Root = () => (
	<Composition
		id="Hello"
		component={Hello}
		width={320}
		height={180}
		fps={30}
		durationInFrames={30}
		defaultProps={{ title: "hello" }}
	/>
);
