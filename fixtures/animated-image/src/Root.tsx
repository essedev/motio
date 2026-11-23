import { AbsoluteFill, AnimatedImage, Composition, staticFile } from "remotion";
import { CELL_HEIGHT, CELL_WIDTH, CELLS, cellCentre, DURATION, FPS } from "./cells";

// Eight animated images on black (so a cleared canvas shows black): the four formats, a playback
// rate, both loop behaviours that stop, and one placed with from, trimBefore and fit="contain".
const Images: React.FC = () => (
	<AbsoluteFill style={{ backgroundColor: "black" }}>
		{CELLS.map(({ file, ...props }, i) => {
			const { x, y } = cellCentre(i);
			return (
				<div
					key={i}
					style={{
						position: "absolute",
						left: x - CELL_WIDTH / 2,
						top: y - CELL_HEIGHT / 2,
						width: CELL_WIDTH,
						height: CELL_HEIGHT,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<AnimatedImage src={staticFile(file)} {...props} />
				</div>
			);
		})}
	</AbsoluteFill>
);

export const Root: React.FC = () => (
	<Composition
		id="AnimatedImages"
		component={Images}
		width={640}
		height={360}
		fps={FPS}
		durationInFrames={DURATION}
	/>
);
