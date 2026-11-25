import { AbsoluteFill, interpolate, useCurrentFrame } from "@motiojs/motio";
import { evolvePath, interpolatePath } from "@motiojs/paths";

// region: paths
const A = "M 50 180 C 120 40, 240 40, 300 180 S 480 320, 590 180";
const B = "M 50 120 C 150 300, 250 300, 320 120 S 500 -60, 590 220";

// One curve drawn progressively with evolvePath(), another morphing from A to B.
export const Paths = () => {
	const frame = useCurrentFrame();
	const progress = interpolate(frame, [0, 59], [0, 1]);
	const evolved = evolvePath(progress, A);
	return (
		<AbsoluteFill>
			<svg width={640} height={360} viewBox="0 0 640 360" aria-hidden="true">
				<path
					d={A}
					fill="none"
					stroke="#1e3a8a"
					strokeWidth={10}
					strokeDasharray={evolved.strokeDasharray}
					strokeDashoffset={evolved.strokeDashoffset}
				/>
				<path d={interpolatePath(progress, A, B)} fill="none" stroke="#b91c1c" strokeWidth={4} />
			</svg>
		</AbsoluteFill>
	);
};
// endregion
