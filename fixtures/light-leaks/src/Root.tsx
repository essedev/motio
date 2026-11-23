import { LightLeak } from "@remotion/light-leaks";
import { AbsoluteFill, Composition, Sequence } from "remotion";

const size = { width: 480, height: 270, fps: 30 } as const;

// The documented example: one leak over the whole composition, on black.
const Basic: React.FC = () => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		<LightLeak durationInFrames={60} seed={3} hueShift={30} />
	</AbsoluteFill>
);

// A leak over a cut, as the documented transition: blue for 30 frames, then pink, with a blue-ish
// leak of 20 frames centred on the cut, and a second, smaller leak sized by props.
const Cut: React.FC = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={30}>
			<AbsoluteFill style={{ backgroundColor: "#0b84f3" }} />
		</Sequence>
		<Sequence from={30}>
			<AbsoluteFill style={{ backgroundColor: "pink" }} />
		</Sequence>
		<LightLeak from={20} durationInFrames={20} seed={5} hueShift={240} />
		<LightLeak durationInFrames={60} width={160} height={90} style={{ left: 300, top: 160 }} />
	</AbsoluteFill>
);

export const Root: React.FC = () => (
	<>
		<Composition id="light-leak-basic" component={Basic} {...size} durationInFrames={60} />
		<Composition id="light-leak-cut" component={Cut} {...size} durationInFrames={60} />
	</>
);
