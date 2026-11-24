import { AbsoluteFill, interpolate } from "@motiojs/motio";
import { DISPLAY, SANS } from "../brand/fonts";
import { Lockup } from "../brand/Lockup";
import { useCalmSpring } from "../brand/motion";
import { Rise } from "../brand/Rise";
import { Ruler } from "../brand/Ruler";
import { PALETTE } from "../brand/tokens";

/** The playhead's resting frame on the banner's ruler. */
const PLAYHEAD = 41;

/**
 * The GitHub README banner, 1280x320 (rendered at twice the size for sharp screens): the lockup
 * on a Pulse field, the promise on Plum over a timeline ruler whose playhead runs to its frame.
 */
export const ReadmeBanner = () => {
	const run = useCalmSpring(10, 40);
	return (
		<AbsoluteFill style={{ background: PALETTE.plum, color: PALETTE.mist }}>
			<div
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: 0,
					width: 500,
					background: PALETTE.pulse,
					display: "flex",
					alignItems: "center",
					paddingLeft: 70,
				}}
			>
				<Lockup size={76} tone="ink" ink={PALETTE.plum} />
			</div>
			<div style={{ position: "absolute", left: 556, right: 56, top: 44 }}>
				<h1
					style={{
						margin: 0,
						fontFamily: DISPLAY,
						fontWeight: 880,
						fontStretch: "110%",
						fontSize: 56,
						lineHeight: 0.95,
						letterSpacing: "-0.025em",
					}}
				>
					<Rise delay={4}>Make videos</Rise>
					<Rise delay={8}>with React.</Rise>
				</h1>
				<p
					style={{
						margin: "14px 0 0",
						fontFamily: SANS,
						fontWeight: 500,
						fontSize: 24,
						lineHeight: 1.35,
						color: "rgb(246 239 244 / 0.82)",
						opacity: interpolate(run, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
					}}
				>
					Rendered frame by frame in headless Chrome. Apache-2.0.
				</p>
			</div>
			<div style={{ position: "absolute", left: 556, bottom: 0, height: 62, overflow: "hidden" }}>
				<Ruler step={9.6} frames={70} playhead={run * PLAYHEAD} height={62} ink={PALETTE.mist} />
			</div>
		</AbsoluteFill>
	);
};
