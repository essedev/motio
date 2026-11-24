import { AbsoluteFill, interpolate } from "motio";
import { DISPLAY } from "../brand/fonts";
import { useLayout } from "../brand/layout";
import { useBrandSpring } from "../brand/motion";
import { Rise } from "../brand/Rise";
import { PALETTE } from "../brand/tokens";

/** A line that rises while its width springs open: width is the brand's kinetic gesture. */
const Line = ({ delay, children }: { delay: number; children: string }) => {
	const s = useBrandSpring(delay);
	return (
		<Rise delay={delay}>
			<span style={{ fontStretch: `${interpolate(s, [0, 1], [60, 96])}%` }}>{children}</span>
		</Rise>
	);
};

/** The promise on a Pulse field: "Make videos with React. Open source." */
export const Pitch = () => {
	const { tall } = useLayout();
	const tag = useBrandSpring(tall ? 22 : 18);
	const lines = tall ? ["Make", "videos", "with", "React."] : ["Make videos", "with React."];
	return (
		<AbsoluteFill
			style={{
				background: PALETTE.pulse,
				color: PALETTE.plum,
				justifyContent: "center",
				padding: tall ? "0 90px" : "0 140px",
			}}
		>
			<h1
				style={{
					margin: 0,
					fontFamily: DISPLAY,
					fontWeight: 900,
					fontSize: tall ? 210 : 230,
					lineHeight: 0.86,
					letterSpacing: "-0.04em",
				}}
			>
				{lines.map((line, i) => (
					<Line key={line} delay={2 + i * 4}>
						{line}
					</Line>
				))}
			</h1>
			<div style={{ marginTop: tall ? 56 : 44 }}>
				<span
					style={{
						display: "inline-block",
						padding: tall ? "12px 34px 26px" : "12px 36px 26px",
						background: PALETTE.spark,
						borderRadius: 22,
						fontFamily: DISPLAY,
						fontWeight: 880,
						fontStretch: "112%",
						fontSize: tall ? 104 : 120,
						whiteSpace: "nowrap",
						lineHeight: 1,
						letterSpacing: "-0.03em",
						scale: String(tag),
						transformOrigin: "0 50%",
					}}
				>
					Open source.
				</span>
			</div>
		</AbsoluteFill>
	);
};
