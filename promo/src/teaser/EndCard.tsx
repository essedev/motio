import { AbsoluteFill, Sequence } from "@motiojs/motio";
import { DISPLAY } from "../brand/fonts";
import { Lockup } from "../brand/Lockup";
import { useLayout } from "../brand/layout";
import { Mark } from "../brand/Mark";
import { useBrandSpring, useCalmSpring } from "../brand/motion";
import { Pill } from "../brand/Pill";
import { Rise } from "../brand/Rise";
import { PALETTE } from "../brand/tokens";

/** The end card: the social card's composition at video size, Pulse and Plum edge to edge. */
export const EndCard = () => {
	const { tall, width, height } = useLayout();
	const field = useCalmSpring(0, 16);
	const tag = useBrandSpring(18);
	const pills = useBrandSpring(26);
	// The Plum field: the right third of a wide frame, the bottom 40% of a tall one.
	const split = tall ? Math.round(height * 0.58) : Math.round(width * 0.64);
	const markSize = tall ? 860 : 820;
	return (
		<AbsoluteFill style={{ background: PALETTE.pulse, color: PALETTE.plum }}>
			<div
				style={{
					position: "absolute",
					left: tall ? 90 : 120,
					top: tall ? 120 : 104,
					bottom: tall ? height - split + 80 : 100,
					width: tall ? width - 180 : split - 200,
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
				}}
			>
				<Lockup size={tall ? 80 : 84} tone="ink" ink={PALETTE.plum} />
				<div>
					<h1
						style={{
							margin: 0,
							fontFamily: DISPLAY,
							fontWeight: 900,
							fontStretch: "92%",
							fontSize: tall ? 150 : 156,
							lineHeight: 0.88,
							letterSpacing: "-0.035em",
						}}
					>
						<Rise delay={4}>Make videos</Rise>
						<Rise delay={8}>with React.</Rise>
					</h1>
					<span
						style={{
							display: "inline-block",
							marginTop: 34,
							padding: "12px 32px 22px",
							background: PALETTE.spark,
							borderRadius: 22,
							fontFamily: DISPLAY,
							fontWeight: 880,
							fontStretch: "112%",
							fontSize: tall ? 100 : 104,
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
					background: PALETTE.plum,
					overflow: "hidden",
					...(tall
						? { left: 0, right: 0, bottom: 0, top: split, translate: `0 ${(1 - field) * 100}%` }
						: { top: 0, bottom: 0, right: 0, left: split, translate: `${(1 - field) * 100}% 0` }),
				}}
			>
				<Sequence from={6} layout="none">
					<Mark
						size={markSize}
						style={{
							position: "absolute",
							left: tall ? 70 : -90,
							top: tall ? -150 : 90,
						}}
					/>
				</Sequence>
				<div
					style={{
						position: "absolute",
						left: tall ? 90 : 64,
						bottom: tall ? 110 : 84,
						display: "flex",
						gap: 14,
						opacity: pills,
						translate: `0 ${(1 - pills) * 30}px`,
					}}
				>
					<Pill fill={PALETTE.spark} ink={PALETTE.plum} size={tall ? 36 : 34}>
						pre-alpha
					</Pill>
					<Pill fill="rgb(255 255 255 / 0.12)" ink={PALETTE.mist} size={tall ? 36 : 34}>
						Apache-2.0
					</Pill>
				</div>
			</div>
		</AbsoluteFill>
	);
};
