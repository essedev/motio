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

	// Sizes and margins instead of CSS transforms: Chrome can draw an element whose transform
	// changes from frame to frame a little differently depending on the frame rendered before
	// it, which `motio check determinism` reports.
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily }}>
			{/* <Img> waits for the image to load before the frame is captured. */}
			<Img src={staticFile("logo.svg")} style={{ width: 220 * pop, height: 220 * pop }} />
			<div
				style={{
					color: "white",
					fontSize: 40,
					opacity: caption,
					marginTop: interpolate(caption, [0, 1], [52, 32]),
				}}
			>
				Made with Motio
			</div>
		</AbsoluteFill>
	);
};
