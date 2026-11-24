# Compositions

A composition is something Motio can render: a component plus its size, frame rate, length and default props. `<Composition>` declares a video, `<Still>` a single image (a composition of one frame), and `<Folder>` groups them in the preview's list. All three go in the root passed to `registerRoot()`:

<!-- example: examples/src/compositions.tsx#root -->
```tsx
import { Composition, Folder, Still } from "@motiojs/motio";

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
```

Ids may contain letters, numbers and hyphens, and must be unique; the CLI selects a composition by id (`motio render src/index.ts Clip-Square`). Width and height must be even for the default H.264 output. `motio compositions src/index.ts` lists every composition with its size, frame rate and length.

## Props

A composition's component receives `defaultProps`, with the props of the render merged over them. On the CLI, `--props` takes a JSON object or the path to a JSON file:

```bash
pnpm exec motio render src/index.ts Clip out/launch.mp4 --props='{"title":"Launch day"}'
pnpm exec motio render src/index.ts Clip out/launch.mp4 --props=data/launch.json
```

In the preview, the props editor changes them live. Props must be JSON-serialisable: they travel from Node to the browser. `getInputProps()` reads the props given to the render from anywhere, including module level:

<!-- example: examples/src/compositions.tsx#input-props -->
```tsx
import { getInputProps } from "@motiojs/motio";

// The props given with --props (or inputProps in Node), readable anywhere, even at module level.
const { title } = getInputProps<{ title?: string }>();
```

## Metadata from data

`calculateMetadata()` runs before a composition renders, with the final props. It can load data and return new props, and set the length, frame rate or size from them, so a video can be exactly as long as its content:

<!-- example: examples/src/compositions.tsx#metadata -->
```tsx
import { type CalculateMetadataFunction, Composition } from "@motiojs/motio";

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
```

It runs in the browser, in the preview each time the props change and once at the start of a render. The `captions` starter uses it to load the transcript and size the video to the last word. `abortSignal` is aborted when a newer call replaces this one.
