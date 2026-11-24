import { AbsoluteFill } from "motio";
import { DISPLAY, MONO, SANS } from "../brand/fonts";
import { useLayout } from "../brand/layout";
import { useCalmSpring } from "../brand/motion";
import { PALETTE } from "../brand/tokens";

type Reason = { title: string[]; body: string; detail?: string; field: string; ink: string };

// The four reasons of the README, each on its own field; fields meet edge to edge.
const REASONS: Reason[] = [
	{
		title: ["Apache-2.0"],
		body: "Free for any use. No fees per render or per seat.",
		field: PALETTE.pulse,
		ink: PALETTE.plum,
	},
	{
		title: ["Chrome", "pixels"],
		body: "No reimplementation of CSS. If it looks right in Chrome, it renders right.",
		field: PALETTE.spark,
		ink: PALETTE.plum,
	},
	{
		title: ["Deterministic", "by test"],
		body: "Same frame, same pixels, in any order. Checked on decoded frame hashes.",
		detail: "motio check determinism",
		field: PALETTE.drift,
		ink: PALETTE.plum,
	},
	{
		title: ["Agent-first"],
		body: "Every command prints JSON. Errors carry stable codes.",
		detail: "motio render --json",
		field: PALETTE.plum,
		ink: PALETTE.mist,
	},
];

const Field = ({ reason, index, tall }: { reason: Reason; index: number; tall: boolean }) => {
	const enter = useCalmSpring(index * 5, 18);
	const text = useCalmSpring(8 + index * 5, 16);
	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				minHeight: 0,
				background: reason.field,
				color: reason.ink,
				translate: tall ? `${(1 - enter) * 110}% 0` : `0 ${(1 - enter) * 110}%`,
				display: "flex",
				flexDirection: "column",
				justifyContent: tall ? "center" : "flex-start",
				// Titles start on one line across the four fields.
				padding: tall ? "0 80px" : "560px 52px 0",
			}}
		>
			<div style={{ opacity: text, translate: `0 ${(1 - text) * 30}px` }}>
				<h3
					style={{
						margin: 0,
						fontFamily: DISPLAY,
						fontWeight: 900,
						fontStretch: tall ? "90%" : "74%",
						fontSize: tall ? 84 : 66,
						whiteSpace: "nowrap",
						lineHeight: 0.92,
						letterSpacing: "-0.03em",
					}}
				>
					{reason.title.map((line) => (
						<span key={line} style={{ display: "block" }}>
							{line}
						</span>
					))}
				</h3>
				<p
					style={{
						margin: tall ? "18px 0 0" : "26px 0 0",
						fontFamily: SANS,
						fontWeight: 500,
						fontSize: tall ? 34 : 31,
						lineHeight: 1.35,
						maxWidth: tall ? 860 : 380,
					}}
				>
					{reason.body}
				</p>
				{reason.detail && (
					<code
						style={{
							display: "inline-block",
							marginTop: tall ? 18 : 26,
							padding: "8px 14px",
							borderRadius: 10,
							background: reason.ink === PALETTE.plum ? PALETTE.plum : PALETTE.night,
							color: PALETTE.mist,
							fontFamily: MONO,
							fontWeight: 500,
							fontSize: tall ? 28 : 24,
							lineHeight: 1.2,
						}}
					>
						{reason.detail}
					</code>
				)}
			</div>
		</div>
	);
};

/** Why Motio: four fields, one reason each. */
export const Reasons = () => {
	const { tall } = useLayout();
	return (
		<AbsoluteFill
			style={{
				background: PALETTE.night,
				flexDirection: tall ? "column" : "row",
				overflow: "hidden",
			}}
		>
			{REASONS.map((reason, i) => (
				<Field key={reason.title.join(" ")} reason={reason} index={i} tall={tall} />
			))}
		</AbsoluteFill>
	);
};
