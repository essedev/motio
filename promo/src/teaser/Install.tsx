import { AbsoluteFill, useCurrentFrame } from "motio";
import { DISPLAY, MONO, SANS } from "../brand/fonts";
import { useLayout } from "../brand/layout";
import { useCalmSpring } from "../brand/motion";
import { Pill } from "../brand/Pill";
import { Rise } from "../brand/Rise";
import { MUTED, PALETTE } from "../brand/tokens";

// The three commands of the guide's getting started, typed one after another.
const COMMANDS = [
	{ text: "pnpm create motio my-video", note: "a project from a starter", start: 8 },
	{ text: "pnpm dev", note: "preview in the browser", start: 26 },
	{ text: "pnpm render", note: "out/intro.mp4", start: 36 },
];
/** Characters typed per frame. */
const SPEED = 2;

const Command = ({
	text,
	note,
	start,
	tall,
	last,
}: {
	text: string;
	note: string;
	start: number;
	tall: boolean;
	last: boolean;
}) => {
	const frame = useCurrentFrame();
	const typed = Math.max(0, Math.min(text.length, Math.floor((frame - start) * SPEED)));
	const done = start + text.length / SPEED;
	const noteIn = useCalmSpring(done + 2, 12);
	// The cursor sits on the line being typed, and blinks on the last one once it is done.
	const active = frame >= start && (frame < done + 3 || last);
	const blinkOn = frame < done + 3 || Math.floor((frame - done) / 10) % 2 === 1;
	return (
		<>
			<code
				style={{
					fontFamily: MONO,
					fontWeight: 500,
					fontSize: tall ? 54 : 58,
					lineHeight: 1.4,
					whiteSpace: "pre",
					// Lines not reached yet keep their place, so nothing moves as they appear.
					visibility: frame < start ? "hidden" : "visible",
				}}
			>
				<span style={{ color: PALETTE.pulse }}>$ </span>
				{text.slice(0, typed)}
				<span
					style={{
						display: "inline-block",
						width: "0.6em",
						height: "1.05em",
						verticalAlign: "-0.18em",
						background: PALETTE.spark,
						opacity: active && blinkOn ? 1 : 0,
					}}
				/>
			</code>
			<span
				style={{
					alignSelf: "center",
					fontFamily: SANS,
					fontWeight: 500,
					fontSize: tall ? 32 : 30,
					color: MUTED.onDark,
					opacity: noteIn,
					translate: `${(1 - noteIn) * -16}px 0`,
					whiteSpace: "nowrap",
					marginBottom: tall ? 28 : 0,
				}}
			>
				{note}
			</span>
		</>
	);
};

/** Three commands to a video, and an honest note: nothing is on npm yet. */
export const Install = () => {
	const { tall } = useLayout();
	const note = useCalmSpring(50, 14);
	return (
		<AbsoluteFill
			style={{
				background: PALETTE.plum,
				color: PALETTE.mist,
				justifyContent: "center",
				padding: tall ? "0 70px" : "0 150px",
			}}
		>
			<h2
				style={{
					margin: "0 0 56px",
					fontFamily: DISPLAY,
					fontWeight: 900,
					fontStretch: tall ? "100%" : "92%",
					fontSize: tall ? 112 : 100,
					whiteSpace: "nowrap",
					lineHeight: 0.9,
					letterSpacing: "-0.035em",
				}}
			>
				{tall ? (
					<>
						<Rise delay={0}>Three</Rise>
						<Rise delay={3}>commands</Rise>
						<Rise delay={6}>to a video.</Rise>
					</>
				) : (
					<Rise delay={0}>Three commands to a video.</Rise>
				)}
			</h2>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: tall ? "1fr" : "auto 1fr",
					columnGap: 56,
					rowGap: tall ? 0 : 6,
				}}
			>
				{COMMANDS.map((c, i) => (
					<Command key={c.text} {...c} tall={tall} last={i === COMMANDS.length - 1} />
				))}
			</div>
			<div
				style={{
					marginTop: 56,
					display: "flex",
					alignItems: "center",
					gap: 20,
					opacity: note,
					fontFamily: SANS,
					fontWeight: 500,
					fontSize: tall ? 32 : 30,
					color: MUTED.onDark,
				}}
			>
				<Pill fill={PALETTE.spark} ink={PALETTE.plum} size={tall ? 30 : 28}>
					pre-alpha
				</Pill>
				Not on npm yet.
			</div>
		</AbsoluteFill>
	);
};
