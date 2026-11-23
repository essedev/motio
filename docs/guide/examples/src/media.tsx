import { Video as CanvasVideo } from "@motiojs/media";
import {
	AbsoluteFill,
	Audio,
	Img,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	Video,
} from "motio";

// region: img
export const Cover = () => (
	<AbsoluteFill>
		{/* public/cover.jpg; the frame is captured only once the image has loaded. */}
		<Img
			src={staticFile("cover.jpg")}
			style={{ width: "100%", height: "100%", objectFit: "cover" }}
		/>
	</AbsoluteFill>
);
// endregion

// region: video
export const Clip = () => (
	<AbsoluteFill>
		{/* The exact source frame for every video frame, extracted by FFmpeg. Skips the first
		    2 seconds of the file (at 30 fps) and plays at 1.5x. */}
		<OffthreadVideo src={staticFile("clip.mp4")} trimBefore={60} playbackRate={1.5} />
	</AbsoluteFill>
);

// A native <video> element, for refs and canvas drawing; seeked for every frame when rendering.
export const NativeClip = () => <Video src={staticFile("clip.mp4")} muted />;

// The @motiojs/media component, drawn into a <canvas>.
export const CanvasClip = () => <CanvasVideo src={staticFile("clip.mp4")} />;
// endregion

// region: audio
export const Soundtrack = () => (
	<>
		{/* Fades in over the first second; the function gets the frame since the audio started. */}
		<Audio
			src={staticFile("music.mp3")}
			volume={(f) => interpolate(f, [0, 30], [0, 0.8], { extrapolateRight: "clamp" })}
		/>
		{/* A sound effect at frame 90. */}
		<Sequence from={90}>
			<Audio src={staticFile("whoosh.wav")} />
		</Sequence>
	</>
);
// endregion
