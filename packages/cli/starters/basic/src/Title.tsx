import {
	AbsoluteFill,
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";
import { fontFamily } from "./fonts";

export const Title = ({ title, subtitle }: { title: string; subtitle: string }) => {
	// Inside a <Series.Sequence>, the frame starts at 0 when the scene starts and
	// durationInFrames is the length of the scene.
	const frame = useCurrentFrame();
	const { fps, durationInFrames } = useVideoConfig();

	// A spring goes from 0 to 1; damping 200 settles without bouncing. Frame 0 is what the
	// preview opens on and what many players show before playing, so the title is on screen
	// from the first frame and the spring only settles its size and position.
	const enter = spring({ frame, fps, config: { damping: 200 } });
	const scale = interpolate(enter, [0, 1], [0.85, 1]);
	const rise = interpolate(enter, [0, 1], [24, 0]);
	const subtitleOpacity = interpolate(frame, [12, 30], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	// Fade the whole scene out over its last 10 frames.
	const exit = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<AbsoluteFill
			style={{ justifyContent: "center", alignItems: "center", fontFamily, opacity: exit }}
		>
			<h1
				style={{
					color: "white",
					fontSize: 110,
					fontWeight: 700,
					margin: 0,
					transform: `translateY(${rise}px) scale(${scale})`,
				}}
			>
				{title}
			</h1>
			<p style={{ color: "#ffb000", fontSize: 44, fontWeight: 400, opacity: subtitleOpacity }}>
				{subtitle}
			</p>
		</AbsoluteFill>
	);
};
