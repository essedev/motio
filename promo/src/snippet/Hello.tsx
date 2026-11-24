import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";
import { field, word } from "./styles";

export const Hello = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const pop = spring({ frame, fps, config: { damping: 12 } });
	const turn = interpolate(pop, [0, 1], [-90, -6]);
	return (
		<AbsoluteFill style={field}>
			<h1 style={{ ...word, scale: pop, rotate: `${turn}deg` }}>
				Hello
			</h1>
		</AbsoluteFill>
	);
};
