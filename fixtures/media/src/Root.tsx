import { Video as MediaVideo } from "@remotion/media";
import {
	AbsoluteFill,
	Audio,
	Composition,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	Video,
} from "remotion";

const fill = { width: "100%", height: "100%" } as const;
const size = { width: 480, height: 270 } as const;

const Off: React.FC<{ src: string; playbackRate?: number; trimBefore?: number; from?: number }> = ({
	src,
	playbackRate,
	trimBefore,
	from = 0,
}) => (
	<AbsoluteFill style={{ backgroundColor: "#202020" }}>
		<Sequence from={from}>
			<OffthreadVideo
				src={staticFile(src)}
				style={fill}
				{...(playbackRate === undefined ? {} : { playbackRate })}
				{...(trimBefore === undefined ? {} : { trimBefore })}
			/>
		</Sequence>
	</AbsoluteFill>
);

const Html5: React.FC<{ src: string }> = ({ src }) => (
	<AbsoluteFill>
		<Video src={staticFile(src)} style={fill} />
	</AbsoluteFill>
);

const Media: React.FC<{ src: string }> = ({ src }) => (
	<AbsoluteFill>
		<MediaVideo src={staticFile(src)} style={fill} />
	</AbsoluteFill>
);

const Clicks: React.FC<{
	from?: number;
	trimBefore?: number;
	playbackRate?: number;
	ramp?: boolean;
	volume?: number;
	step?: boolean;
}> = ({ from = 0, trimBefore, playbackRate, ramp, volume, step }) => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		<Sequence from={from}>
			<Audio
				src={staticFile("clicks.wav")}
				{...(trimBefore === undefined ? {} : { trimBefore })}
				{...(playbackRate === undefined ? {} : { playbackRate })}
				{...(ramp
					? {
							volume: (f: number) =>
								interpolate(f, [0, 60], [0.1, 1], { extrapolateRight: "clamp" }),
						}
					: {})}
				{...(volume === undefined ? {} : { volume })}
				{...(step ? { volume: (f: number) => (f < 30 ? 0.2 : 0.8) } : {})}
			/>
		</Sequence>
	</AbsoluteFill>
);

/** Video and audio fixtures; the oracle records which source frame each output frame shows and where clicks land. */
export const Root: React.FC = () => (
	<>
		<Composition
			id="ov-24in30"
			component={Off}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-24.mp4" }}
		/>
		<Composition
			id="ov-30in60"
			component={Off}
			fps={60}
			durationInFrames={120}
			{...size}
			defaultProps={{ src: "stamp-30.mp4" }}
		/>
		<Composition
			id="ov-5994in30"
			component={Off}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-5994.mp4" }}
		/>
		<Composition
			id="ov-60in30"
			component={Off}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-60.mp4" }}
		/>
		<Composition
			id="ov-rate2"
			component={Off}
			fps={30}
			durationInFrames={45}
			{...size}
			defaultProps={{ src: "stamp-30.mp4", playbackRate: 2 }}
		/>
		<Composition
			id="ov-trim"
			component={Off}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-30.mp4", trimBefore: 15, from: 10 }}
		/>
		<Composition
			id="html5-24in30"
			component={Html5}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-24.mp4" }}
		/>
		<Composition
			id="media-24in30"
			component={Media}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ src: "stamp-24.mp4" }}
		/>
		<Composition
			id="audio-offset"
			component={Clicks}
			fps={30}
			durationInFrames={90}
			{...size}
			defaultProps={{ from: 15, trimBefore: 6 }}
		/>
		<Composition
			id="audio-rate2"
			component={Clicks}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ playbackRate: 2 }}
		/>
		<Composition
			id="audio-ramp"
			component={Clicks}
			fps={30}
			durationInFrames={90}
			{...size}
			defaultProps={{ ramp: true }}
		/>
		<Composition
			id="audio-vol25"
			component={Clicks}
			fps={30}
			durationInFrames={30}
			{...size}
			defaultProps={{ volume: 0.25 }}
		/>
		<Composition
			id="audio-vol50"
			component={Clicks}
			fps={30}
			durationInFrames={30}
			{...size}
			defaultProps={{ volume: 0.5 }}
		/>
		<Composition
			id="audio-step"
			component={Clicks}
			fps={30}
			durationInFrames={60}
			{...size}
			defaultProps={{ step: true }}
		/>
	</>
);
