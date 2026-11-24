import { Audio, Html5Video, OffthreadVideo, Video } from "@motiojs/media";
import { AbsoluteFill, Sequence, staticFile } from "@motiojs/motio";
import { useCallback, useRef } from "react";

// region: offthread
// The default: the exact source frame for each video frame, extracted by FFmpeg and shown as an
// image. Any codec FFmpeg reads works, ProRes and HEVC included.
export const Interview = () => (
	<AbsoluteFill>
		<OffthreadVideo
			src={staticFile("interview.mov")}
			// Skip the first 3 seconds of the file (at 30 fps) and show the next 10.
			trimBefore={90}
			durationInFrames={300}
			// Keep the alpha channel of a ProRes 4444 or VP9 file with transparency.
			transparent
			style={{ width: "100%", height: "100%", objectFit: "cover" }}
		/>
	</AbsoluteFill>
);
// endregion

// region: html5
// A real <video> element, seeked to each frame. The ref is the element, so it can be read or
// drawn like any video. The file must be one Chrome plays (H.264, VP9, AV1 in MP4 or WebM).
export const Mirrored = () => {
	const canvas = useRef<HTMLCanvasElement>(null);
	// Called with the <video> element every time it shows a new frame.
	const onVideoFrame = useCallback((frame: CanvasImageSource) => {
		const context = canvas.current?.getContext("2d");
		context?.drawImage(frame, 0, 0, 640, 360);
	}, []);
	return (
		<AbsoluteFill style={{ flexDirection: "row" }}>
			<Html5Video src={staticFile("clip.mp4")} onVideoFrame={onVideoFrame} style={{ width: 640 }} />
			<canvas ref={canvas} width={640} height={360} style={{ transform: "scaleX(-1)" }} />
		</AbsoluteFill>
	);
};
// endregion

// region: canvas
// The exact source frame, drawn into a <canvas>; `objectFit` places it in the canvas box.
export const Background = () => (
	<Video
		src={staticFile("loop.mp4")}
		loop
		muted
		objectFit="cover"
		style={{ width: "100%", height: "100%" }}
	/>
);

// With `headless`, nothing is mounted and `onVideoFrame` receives each frame to process: an
// ImageBitmap in a render, the <video> element in the preview.
export const Analysed = ({ onFrame }: { onFrame: (frame: CanvasImageSource) => void }) => (
	<Video src={staticFile("clip.mp4")} headless onVideoFrame={onFrame} />
);
// endregion

// region: audio
export const Voiceover = () => (
	<Sequence from={30}>
		{/* At 1.25x the pitch rises, as with a record played faster; preservePitch keeps it. */}
		<Audio src={staticFile("voiceover.mp3")} playbackRate={1.25} preservePitch volume={0.9} />
	</Sequence>
);
// endregion
