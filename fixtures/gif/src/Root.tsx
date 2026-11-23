import { Gif } from "@remotion/gif";
import { AbsoluteFill, Composition, staticFile } from "remotion";

const size = { width: 640, height: 360, fps: 30 } as const;
const counter = staticFile("counter.gif");
const sprite = staticFile("sprite.gif");

// A checkerboard behind the GIFs, so transparency and disposal show.
const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<AbsoluteFill
		style={{
			backgroundColor: "#f4f1ea",
			backgroundImage:
				"linear-gradient(45deg, #d9d4c7 25%, transparent 25%, transparent 75%, #d9d4c7 75%), linear-gradient(45deg, #d9d4c7 25%, transparent 25%, transparent 75%, #d9d4c7 75%)",
			backgroundSize: "40px 40px",
			backgroundPosition: "0 0, 20px 20px",
		}}
	>
		<AbsoluteFill
			style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}
		>
			{children}
		</AbsoluteFill>
	</AbsoluteFill>
);

// The uneven delays of counter.gif, stretched to twice its size, and the transparent sprite.gif
// with every disposal method, at three times its size.
const Basic: React.FC = () => (
	<Background>
		<Gif src={counter} width={320} height={180} />
		<Gif src={sprite} width={240} height={240} fit="contain" />
	</Background>
);

// Fit modes, playback rates and loop behaviours, one placed with the inherited <Sequence> props.
const Options: React.FC = () => (
	<Background>
		<Gif src={counter} width={150} height={150} fit="contain" playbackRate={1.5} />
		<Gif src={counter} width={150} height={150} fit="cover" loopBehavior="pause-after-finish" />
		<Gif
			src={sprite}
			width={150}
			height={100}
			fit="cover"
			playbackRate={0.5}
			style={{ borderRadius: 16 }}
		/>
		<Gif src={counter} width={100} height={60} loopBehavior="unmount-after-finish" from={10} />
	</Background>
);

// No width or height: the canvas takes its laid-out size from CSS.
const AutoSize: React.FC = () => (
	<Background>
		<Gif src={counter} style={{ width: 300, height: 120 }} />
		<Gif src={sprite} fit="contain" />
	</Background>
);

export const Root: React.FC = () => (
	<>
		<Composition id="gif-basic" component={Basic} durationInFrames={90} {...size} />
		<Composition id="gif-options" component={Options} durationInFrames={90} {...size} />
		<Composition id="gif-auto-size" component={AutoSize} durationInFrames={60} {...size} />
	</>
);
