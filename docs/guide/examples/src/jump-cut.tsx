import {
	type CalculateMetadataFunction,
	Composition,
	OffthreadVideo,
	Series,
	staticFile,
} from "motio";

// region: jump-cut
/** A stretch of the recording to keep, in seconds: what getSilentParts() returns. */
type Part = { startInSeconds: number; endInSeconds: number };
type JumpCutProps = { src: string; parts: Part[] };

const FPS = 30;
const toFrames = (part: Part) => ({
	trimBefore: Math.round(part.startInSeconds * FPS),
	trimAfter: Math.round(part.endInSeconds * FPS),
});

// The kept parts back to back, each playing its stretch of the file.
const JumpCut = ({ src, parts }: JumpCutProps) => (
	<Series>
		{parts.map((part) => {
			const { trimBefore, trimAfter } = toFrames(part);
			return (
				<Series.Sequence key={trimBefore} durationInFrames={trimAfter - trimBefore}>
					<OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} trimAfter={trimAfter} />
				</Series.Sequence>
			);
		})}
	</Series>
);

// The video lasts as long as the parts together.
const calculateMetadata: CalculateMetadataFunction<JumpCutProps> = ({ props }) => ({
	durationInFrames: Math.max(
		1,
		props.parts.reduce((sum, part) => {
			const { trimBefore, trimAfter } = toFrames(part);
			return sum + trimAfter - trimBefore;
		}, 0),
	),
});

export const JumpCutRoot = () => (
	<Composition
		id="JumpCut"
		component={JumpCut}
		width={1280}
		height={720}
		fps={FPS}
		durationInFrames={1}
		defaultProps={{ src: "interview.mp4", parts: [] }}
		calculateMetadata={calculateMetadata}
	/>
);
// endregion
