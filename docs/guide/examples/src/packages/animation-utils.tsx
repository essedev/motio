import { interpolateStyles, makeTransform, rotate, translate } from "@motiojs/animation-utils";
import { AbsoluteFill, useCurrentFrame } from "@motiojs/motio";

// region: card
export const Card = () => {
	const frame = useCurrentFrame();
	// Fades in, rises 40 px and straightens over the first 20 frames, then holds.
	const style = interpolateStyles(
		frame,
		[0, 20],
		[
			{ opacity: 0, transform: makeTransform([translate(0, 40), rotate(-4)]) },
			{ opacity: 1, transform: makeTransform([translate(0, 0), rotate(0)]) },
		],
		{ extrapolateRight: "clamp" },
	);
	return (
		<AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
			<div style={{ ...style, padding: 48, background: "white", fontSize: 64 }}>Hello</div>
		</AbsoluteFill>
	);
};
// endregion
