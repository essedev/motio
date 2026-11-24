import type { Caption } from "@motiojs/captions";
import { type CalculateMetadataFunction, Composition, staticFile } from "@motiojs/motio";
import { Captions, type CaptionsProps } from "./Captions";

const FPS = 30;

// Runs before the composition renders (and again when the props change in the preview): loads
// the transcript and makes the video as long as the last word plus half a second.
const calculateMetadata: CalculateMetadataFunction<CaptionsProps> = async ({
	props,
	abortSignal,
}) => {
	const response = await fetch(staticFile(props.src), { signal: abortSignal });
	if (!response.ok) {
		throw new Error(`Could not load ${props.src}: HTTP ${response.status}.`);
	}
	const captions = (await response.json()) as Caption[];
	const lastMs = Math.max(0, ...captions.map((caption) => caption.endMs));
	return {
		props: { ...props, captions },
		durationInFrames: Math.ceil(((lastMs + 500) / 1000) * FPS),
	};
};

export const Root = () => (
	<Composition
		id="Captions"
		component={Captions}
		width={1080}
		height={1080}
		fps={FPS}
		durationInFrames={FPS}
		defaultProps={{ src: "captions.json", captions: [], audio: "word-tones.mp3" }}
		calculateMetadata={calculateMetadata}
	/>
);
