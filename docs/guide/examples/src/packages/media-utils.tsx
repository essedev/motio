import { useAudioData, visualizeAudio } from "@motiojs/media-utils";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "@motiojs/motio";

// region: spectrum
export const Spectrum = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const src = staticFile("music.mp3");
	// null until the file is decoded; the render waits for it.
	const audioData = useAudioData(src);
	if (!audioData) return null;
	// 32 frequency bands at this frame, low frequencies first.
	const bands = visualizeAudio({ audioData, frame, fps, numberOfSamples: 32 });
	return (
		<AbsoluteFill style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, padding: 40 }}>
			<Audio src={src} />
			{bands.map((value, band) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: bands keep their order on every frame.
					key={band}
					style={{ flex: 1, height: `${Math.min(1, value) * 100}%`, background: "#ffb000" }}
				/>
			))}
		</AbsoluteFill>
	);
};
// endregion
