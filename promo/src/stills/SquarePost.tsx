import { AbsoluteFill, interpolate } from "motio";
import { DISPLAY, SANS } from "../brand/fonts";
import { Lockup } from "../brand/Lockup";
import { useBrandSpring } from "../brand/motion";
import { Rise } from "../brand/Rise";
import { PALETTE } from "../brand/tokens";

/** One line of the headline: it rises, and its width springs from narrow to its own. */
const Line = ({ delay, width, children }: { delay: number; width: number; children: string }) => {
	const s = useBrandSpring(delay);
	return (
		<Rise delay={delay}>
			<span style={{ fontStretch: `${interpolate(s, [0, 1], [60, width])}%` }}>{children}</span>
		</Rise>
	);
};

/** The square post, 1080x1080: "Make videos with React. Open source." on a Spark field. */
export const SquarePost = () => {
	const tag = useBrandSpring(22);
	const meta = useBrandSpring(28);
	return (
		<AbsoluteFill style={{ background: PALETTE.spark, color: PALETTE.plum, padding: 84 }}>
			<Lockup size={64} tone="ink" ink={PALETTE.plum} />
			<h1
				style={{
					margin: "auto 0",
					fontFamily: DISPLAY,
					fontWeight: 900,
					fontSize: 150,
					lineHeight: 0.86,
					letterSpacing: "-0.04em",
				}}
			>
				<Line delay={6} width={100}>
					Make
				</Line>
				<Line delay={10} width={150}>
					videos
				</Line>
				<Line delay={14} width={84}>
					with React.
				</Line>
			</h1>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<span
					style={{
						padding: "14px 30px 22px",
						background: PALETTE.pulse,
						borderRadius: 18,
						fontFamily: DISPLAY,
						fontWeight: 880,
						fontStretch: "110%",
						fontSize: 76,
						lineHeight: 1,
						letterSpacing: "-0.03em",
						whiteSpace: "nowrap",
						scale: String(tag),
						transformOrigin: "0 50%",
					}}
				>
					Open source.
				</span>
				<span
					style={{
						fontFamily: SANS,
						fontWeight: 600,
						fontSize: 30,
						lineHeight: 1.3,
						textAlign: "right",
						whiteSpace: "nowrap",
						opacity: meta,
					}}
				>
					Apache-2.0
					<br />
					pre-alpha
				</span>
			</div>
		</AbsoluteFill>
	);
};
