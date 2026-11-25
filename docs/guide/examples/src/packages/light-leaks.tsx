import { LightLeak } from "@motiojs/light-leaks";
import { AbsoluteFill, Sequence } from "@motiojs/motio";

// region: cut
// A leak of 20 frames centred on a cut from blue to pink, at frame 30.
export const Cut = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={30}>
			<AbsoluteFill style={{ backgroundColor: "#0b84f3" }} />
		</Sequence>
		<Sequence from={30}>
			<AbsoluteFill style={{ backgroundColor: "pink" }} />
		</Sequence>
		<LightLeak from={20} durationInFrames={20} seed={5} hueShift={240} />
	</AbsoluteFill>
);
// endregion
