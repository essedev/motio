import { AbsoluteFill } from "@motiojs/motio";
import { DISPLAY, MONO, SANS } from "../brand/fonts";
import { useLayout } from "../brand/layout";
import { useCalmSpring } from "../brand/motion";
import { Rise } from "../brand/Rise";
import { MUTED, PALETTE } from "../brand/tokens";
import { BASELINE_VERSION, BENCH, BEST_SPEEDUP } from "./bench";

const MAX = Math.max(...BENCH.rows.map((r) => r.baseline));

const Bar = ({
	seconds,
	color,
	delay,
	width,
	thickness,
}: {
	seconds: number;
	color: string;
	delay: number;
	width: number;
	thickness: number;
}) => {
	const grow = useCalmSpring(delay, 24);
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 16, height: thickness }}>
			<div
				style={{
					width: Math.max(4, (seconds / MAX) * width * grow),
					height: thickness,
					borderRadius: 6,
					background: color,
				}}
			/>
			<span
				style={{
					fontFamily: MONO,
					fontWeight: 600,
					fontSize: thickness * 0.62,
					color: PALETTE.plum,
					opacity: grow,
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{seconds.toFixed(2)} s
			</span>
		</div>
	);
};

const Legend = ({ color, children, size }: { color: string; children: string; size: number }) => (
	<span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
		<span style={{ width: size * 0.8, height: size * 0.8, borderRadius: 4, background: color }} />
		{children}
	</span>
);

/** The benchmark of docs/ROADMAP.md as bars, with the footnote that says how it was measured. */
export const Speed = () => {
	const { tall } = useLayout();
	const meta = useCalmSpring(10, 16);
	const barWidth = tall ? 760 : 1300;
	const thickness = tall ? 62 : 44;
	return (
		<AbsoluteFill
			style={{
				background: PALETTE.paper,
				color: PALETTE.plum,
				padding: tall ? "160px 80px 130px" : "96px 120px 80px",
				justifyContent: "space-between",
			}}
		>
			<div>
				<h2
					style={{
						margin: 0,
						fontFamily: DISPLAY,
						fontWeight: 900,
						fontStretch: "100%",
						fontSize: tall ? 150 : 120,
						lineHeight: 0.9,
						letterSpacing: "-0.035em",
					}}
				>
					<Rise delay={2}>Up to {BEST_SPEEDUP.toString()}x</Rise>
					<Rise delay={6}>faster renders.</Rise>
				</h2>
				<p
					style={{
						margin: "28px 0 0",
						fontFamily: SANS,
						fontWeight: 500,
						fontSize: tall ? 34 : 32,
						lineHeight: 1.35,
						color: MUTED.onLight,
						opacity: meta,
					}}
				>
					Wall time for the same two compositions, lower is better.
				</p>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: tall ? 64 : 34 }}>
				<div
					style={{
						display: "flex",
						gap: 36,
						fontFamily: SANS,
						fontWeight: 600,
						fontSize: tall ? 32 : 28,
						opacity: meta,
					}}
				>
					<Legend color={PALETTE.pulse} size={tall ? 32 : 28}>
						Motio
					</Legend>
					<Legend color={PALETTE.drift} size={tall ? 32 : 28}>
						{`Remotion ${BASELINE_VERSION}`}
					</Legend>
				</div>
				{BENCH.rows.map((row, i) => (
					<div
						key={row.concurrency}
						style={{
							display: "flex",
							flexDirection: tall ? "column" : "row",
							alignItems: tall ? "flex-start" : "center",
							gap: tall ? 14 : 0,
						}}
					>
						<span
							style={{
								width: tall ? "auto" : 190,
								fontFamily: SANS,
								fontWeight: 600,
								fontSize: tall ? 36 : 30,
								opacity: meta,
							}}
						>
							{row.concurrency === 1 ? "1 tab" : `${row.concurrency} tabs`}
						</span>
						<div style={{ display: "flex", flexDirection: "column", gap: tall ? 12 : 8 }}>
							<Bar
								seconds={row.motio}
								color={PALETTE.pulse}
								delay={14 + i * 6}
								width={barWidth}
								thickness={thickness}
							/>
							<Bar
								seconds={row.baseline}
								color={PALETTE.drift}
								delay={17 + i * 6}
								width={barWidth}
								thickness={thickness}
							/>
						</div>
					</div>
				))}
			</div>
			<p
				style={{
					margin: 0,
					fontFamily: SANS,
					fontWeight: 500,
					fontSize: tall ? 26 : 22,
					lineHeight: 1.4,
					color: MUTED.onLight,
					opacity: meta,
				}}
			>
				{BENCH.note}
			</p>
		</AbsoluteFill>
	);
};
