import { AbsoluteFill, Sequence } from "@motiojs/motio";
import { DISPLAY } from "../brand/fonts";
import { Lockup } from "../brand/Lockup";
import { Mark } from "../brand/Mark";
import { useBrandSpring, useCalmSpring } from "../brand/motion";
import { Pill } from "../brand/Pill";
import { Rise } from "../brand/Rise";
import { PALETTE } from "../brand/tokens";

/**
 * The Open Graph card, 1200x630: the promise on a Pulse field, the mark on a Plum one. It plays
 * as the teaser's end card; the still is its resting frame.
 */
export const OgCard = () => {
	const field = useCalmSpring(0, 14);
	const tag = useBrandSpring(16);
	const pills = useBrandSpring(24);
	return (
		<AbsoluteFill style={{ background: PALETTE.pulse, color: PALETTE.plum }}>
			<div
				style={{
					position: "absolute",
					left: 72,
					top: 64,
					bottom: 60,
					width: 660,
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
				}}
			>
				<Lockup size={54} tone="ink" ink={PALETTE.plum} />
				<div>
					<h1
						style={{
							margin: 0,
							fontFamily: DISPLAY,
							fontWeight: 900,
							fontStretch: "92%",
							fontSize: 96,
							lineHeight: 0.88,
							letterSpacing: "-0.035em",
						}}
					>
						<Rise delay={6}>Make videos</Rise>
						<Rise delay={10}>with React.</Rise>
					</h1>
					<span
						style={{
							display: "inline-block",
							marginTop: 22,
							padding: "8px 20px 14px",
							background: PALETTE.spark,
							borderRadius: 14,
							fontFamily: DISPLAY,
							fontWeight: 880,
							fontStretch: "112%",
							fontSize: 64,
							lineHeight: 1,
							letterSpacing: "-0.03em",
							scale: String(tag),
							transformOrigin: "0 50%",
						}}
					>
						Open source.
					</span>
				</div>
			</div>
			<div
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: 760,
					right: 0,
					background: PALETTE.plum,
					overflow: "hidden",
					translate: `${(1 - field) * 440}px 0`,
				}}
			>
				<Sequence from={4} layout="none">
					<Mark size={540} style={{ position: "absolute", left: -60, top: 72 }} />
				</Sequence>
				<div
					style={{
						position: "absolute",
						left: 40,
						bottom: 52,
						display: "flex",
						gap: 10,
						opacity: pills,
						translate: `0 ${(1 - pills) * 24}px`,
					}}
				>
					<Pill fill={PALETTE.spark} ink={PALETTE.plum} size={22}>
						pre-alpha
					</Pill>
					<Pill fill="rgb(255 255 255 / 0.12)" ink={PALETTE.mist} size={22}>
						Apache-2.0
					</Pill>
				</div>
			</div>
		</AbsoluteFill>
	);
};
