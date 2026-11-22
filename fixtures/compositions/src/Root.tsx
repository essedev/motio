import { Composition, Folder, Still } from "remotion";
import { Assets } from "./compositions/Assets";
import { Basics } from "./compositions/Basics";
import { Motion } from "./compositions/Motion";
import { Poster } from "./compositions/Poster";
import { Timeline } from "./compositions/Timeline";

const size = { width: 640, height: 360, fps: 30 } as const;

export const Root: React.FC = () => (
	<>
		<Folder name="core">
			<Composition
				id="basics"
				component={Basics}
				durationInFrames={60}
				{...size}
				defaultProps={{ title: "Hello Motio" }}
			/>
			<Composition id="timeline" component={Timeline} durationInFrames={60} {...size} />
			<Composition id="motion" component={Motion} durationInFrames={60} {...size} />
		</Folder>
		<Composition id="assets" component={Assets} durationInFrames={30} {...size} />
		<Composition
			id="metadata"
			component={Basics}
			durationInFrames={10}
			{...size}
			defaultProps={{ title: "Metadata" }}
			calculateMetadata={async ({ props }) => ({
				durationInFrames: 45,
				width: 480,
				height: 270,
				props: { ...props, title: `${props.title} resolved` },
			})}
		/>
		<Still
			id="poster"
			component={Poster}
			width={640}
			height={360}
			defaultProps={{ headline: "A still frame" }}
		/>
	</>
);
