import {
	AbsoluteFill,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "motio";
import { fontFamily } from "./fonts";

export const Logo = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	// The default spring overshoots a little before it settles.
	const pop = spring({ frame, fps });
	// The caption starts 15 frames after the logo.
	const caption = spring({ frame, fps, delay: 15, config: { damping: 200 } });

	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily }}>
			{/* <Img> waits for the image to load before the frame is captured. */}
			<Img
				src={staticFile("logo.svg")}
				style={{ width: 220, height: 220, transform: `scale(${pop})` }}
			/>
			<div
				style={{
					color: "white",
					fontSize: 40,
					marginTop: 32,
					opacity: caption,
					transform: `translateY(${interpolate(caption, [0, 1], [20, 0])}px)`,
				}}
			>
				Made with Motio
			</div>
		</AbsoluteFill>
	);
};
