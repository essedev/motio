import { AbsoluteFill, staticFile } from "@motiojs/motio";
import { RemotionRiveCanvas } from "@motiojs/rive";

// region: rive
// The "idle" animation of public/truck.riv, covering the canvas, at 1.5 times its speed.
export const Truck = () => (
	<AbsoluteFill style={{ backgroundColor: "#eef1f6" }}>
		<RemotionRiveCanvas
			src={staticFile("truck.riv")}
			animation="idle"
			fit="cover"
			playbackRate={1.5}
		/>
	</AbsoluteFill>
);
// endregion
