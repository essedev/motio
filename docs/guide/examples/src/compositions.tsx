import {
	type CalculateMetadataFunction,
	Composition,
	Folder,
	getInputProps,
	Still,
} from "@motiojs/motio";

const Clip = ({ title }: { title: string }) => <h1>{title}</h1>;
const Poster = ({ title }: { title: string }) => <h1>{title}</h1>;

// region: root
export const Root = () => (
	<>
		<Composition
			id="Clip"
			component={Clip}
			width={1920}
			height={1080}
			fps={30}
			durationInFrames={150}
			defaultProps={{ title: "Hello" }}
		/>
		<Folder name="Social">
			<Composition
				id="Clip-Square"
				component={Clip}
				width={1080}
				height={1080}
				fps={30}
				durationInFrames={150}
				defaultProps={{ title: "Hello" }}
			/>
		</Folder>
		<Still
			id="Poster"
			component={Poster}
			width={1200}
			height={630}
			defaultProps={{ title: "Hello" }}
		/>
	</>
);
// endregion

// region: metadata
type ReportProps = { url: string; rows: string[] };

const Report = ({ rows }: ReportProps) => (
	<ul>
		{rows.map((row) => (
			<li key={row}>{row}</li>
		))}
	</ul>
);

// Runs before rendering: fetch data, then size the video to fit it.
const calculateMetadata: CalculateMetadataFunction<ReportProps> = async ({
	props,
	abortSignal,
}) => {
	const response = await fetch(props.url, { signal: abortSignal });
	const rows = (await response.json()) as string[];
	return { props: { ...props, rows }, durationInFrames: Math.max(1, rows.length) * 30 };
};

export const ReportRoot = () => (
	<Composition
		id="Report"
		component={Report}
		width={1280}
		height={720}
		fps={30}
		durationInFrames={30}
		defaultProps={{ url: "https://example.com/rows.json", rows: [] }}
		calculateMetadata={calculateMetadata}
	/>
);
// endregion

// region: input-props
// The props given with --props (or inputProps in Node), readable anywhere, even at module level.
const { title } = getInputProps<{ title?: string }>();

// endregion

export { title };
