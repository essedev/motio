import {
	AbsoluteFill,
	interpolate,
	Sequence,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "@motiojs/motio";
import { DISPLAY, MONO, SANS } from "../brand/fonts";
import { useLayout } from "../brand/layout";
import { useCalmSpring } from "../brand/motion";
import { Rise } from "../brand/Rise";
import { Ruler } from "../brand/Ruler";
import { CODE, MUTED, PALETTE } from "../brand/tokens";
import { Hello } from "../snippet/Hello";
import source from "../snippet/Hello.tsx?raw";
import { highlightLine } from "./highlight";

/** Frame of the scene at which the Hello composition starts playing. */
const HELLO_START = 42;
/** Frames of Hello shown on the ruler. */
const RULER_FRAMES = 110;

const LINES = source.trimEnd().split("\n");
const lineOf = (needle: string) => {
	const i = LINES.findIndex((l) => l.includes(needle));
	if (i === -1) throw new Error(`Hello.tsx no longer contains "${needle}".`);
	return i;
};

/**
 * The live values of Hello at its own frame, computed with the same calls as Hello.tsx, shown
 * next to the lines that compute them.
 */
const useLiveValues = (helloFrame: number) => {
	const { fps } = useVideoConfig();
	const pop = spring({ frame: helloFrame, fps, config: { damping: 12 } });
	const turn = interpolate(pop, [0, 1], [-90, -6]);
	return new Map<number, string>([
		[lineOf("useCurrentFrame()"), `frame ${helloFrame}`],
		[lineOf("spring("), `pop ${pop.toFixed(2)}`],
		[lineOf("interpolate("), `turn ${turn.toFixed(1)}`],
	]);
};

/** A live value of Hello: grey until Hello starts, Pulse while it plays. */
const Chip = ({ value, fontSize }: { value: string; fontSize: number }) => {
	const playing = useCurrentFrame() >= HELLO_START;
	return (
		<span
			style={{
				padding: `${fontSize * 0.12}px ${fontSize * 0.4}px`,
				borderRadius: fontSize * 0.3,
				background: playing ? PALETTE.pulse : "rgb(255 255 255 / 0.1)",
				color: playing ? PALETTE.plum : MUTED.onDark,
				fontFamily: MONO,
				fontWeight: 600,
				fontSize: fontSize * 0.8,
				lineHeight: 1.2,
				fontVariantNumeric: "tabular-nums",
				whiteSpace: "pre",
			}}
		>
			{value}
		</span>
	);
};

const Code = ({
	fontSize,
	helloFrame,
	inlineValues,
}: {
	fontSize: number;
	helloFrame: number;
	/** Show the live values at the end of their lines (wide frames only: tall ones lack room). */
	inlineValues: boolean;
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const live = useLiveValues(helloFrame);
	return (
		<div
			style={{
				background: CODE.background,
				borderRadius: 28,
				overflow: "hidden",
				fontFamily: MONO,
				fontWeight: 500,
				fontSize,
				lineHeight: 1.5,
				color: CODE.text,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					background: PALETTE.night,
					height: fontSize * 2.4,
					paddingLeft: fontSize * 0.8,
				}}
			>
				<span
					style={{
						background: CODE.background,
						borderTop: `4px solid ${PALETTE.pulse}`,
						padding: `${fontSize * 0.45}px ${fontSize * 1.1}px`,
						fontFamily: SANS,
						fontWeight: 600,
						fontSize: fontSize * 0.95,
						lineHeight: 1,
					}}
				>
					Hello.tsx
				</span>
			</div>
			<pre
				style={{
					margin: 0,
					padding: `${fontSize * 1.2}px ${fontSize * 1.4}px`,
					font: "inherit",
					tabSize: 2,
				}}
			>
				{LINES.map((line, i) => {
					const s = spring({
						frame,
						fps,
						delay: 2 + i * 1.2,
						config: { damping: 200 },
						durationInFrames: 12,
					});
					const value = live.get(i);
					return (
						<div
							key={`${i.toString()}-${line}`}
							style={{
								display: "flex",
								alignItems: "center",
								gap: fontSize,
								minHeight: "1.5em",
								opacity: s,
								translate: `${(1 - s) * 24}px 0`,
							}}
						>
							<span>
								{highlightLine(line).map((t, j) => (
									<span
										key={`${j.toString()}-${t.text}`}
										style={{ color: CODE[t.kind], fontWeight: t.kind === "fn" ? 600 : 500 }}
									>
										{t.text}
									</span>
								))}
							</span>
							{inlineValues && value && <Chip value={value} fontSize={fontSize} />}
						</div>
					);
				})}
			</pre>
		</div>
	);
};

/** The live values in a row under the code, for tall frames. */
const LiveStrip = ({ helloFrame }: { helloFrame: number }) => {
	const live = useLiveValues(helloFrame);
	return (
		<div style={{ display: "flex", gap: 16, marginTop: 24 }}>
			{[...live.values()].map((value) => (
				<Chip key={value.split(" ")[0]} value={value} fontSize={36} />
			))}
		</div>
	);
};

/** Hello at 1920x1080, scaled into a player frame, with a ruler whose playhead is its frame. */
const Preview = ({ width, helloFrame }: { width: number; helloFrame: number }) => {
	const height = (width * 9) / 16;
	const k = width / 1920;
	const enter = useCalmSpring(20, 16);
	return (
		<div style={{ opacity: enter, translate: `0 ${(1 - enter) * 40}px` }}>
			<div
				style={{
					position: "relative",
					width,
					height,
					borderRadius: 20,
					overflow: "hidden",
					background: "#FFDD3C",
				}}
			>
				<div
					style={{
						position: "absolute",
						width: 1920,
						height: 1080,
						scale: String(k),
						transformOrigin: "0 0",
					}}
				>
					<Sequence from={HELLO_START} width={1920} height={1080} name="Hello">
						<Hello />
					</Sequence>
				</div>
			</div>
			<div style={{ marginTop: 26, overflow: "hidden", paddingTop: 10 }}>
				<Ruler
					step={(width - 2) / RULER_FRAMES}
					frames={RULER_FRAMES}
					playhead={Math.min(helloFrame, RULER_FRAMES)}
					height={48}
					ink={PALETTE.mist}
					labelSize={17}
				/>
			</div>
		</div>
	);
};

/** "A video is a component": the code of Hello.tsx, with Hello rendering next to it. */
export const CodeScene = () => {
	const frame = useCurrentFrame();
	const { tall } = useLayout();
	const helloFrame = Math.max(0, frame - HELLO_START);
	const caption = useCalmSpring(HELLO_START + 20, 16);
	const title = (
		<h2
			style={{
				margin: 0,
				fontFamily: DISPLAY,
				fontWeight: 880,
				fontStretch: "104%",
				fontSize: tall ? 92 : 80,
				lineHeight: 0.92,
				letterSpacing: "-0.03em",
				color: PALETTE.mist,
			}}
		>
			<Rise delay={4}>A video is</Rise>
			<Rise delay={8}>a component.</Rise>
		</h2>
	);
	const note = (
		<p
			style={{
				margin: 0,
				fontFamily: SANS,
				fontWeight: 500,
				fontSize: tall ? 34 : 30,
				lineHeight: 1.4,
				color: MUTED.onDark,
				opacity: caption,
			}}
		>
			Every value comes from the frame number, so any frame renders alone, in any order.
		</p>
	);
	if (tall) {
		return (
			<AbsoluteFill style={{ background: PALETTE.night, padding: "96px 60px 0" }}>
				{title}
				<div style={{ marginTop: 40 }}>
					<Code fontSize={21} helloFrame={helloFrame} inlineValues={false} />
				</div>
				<LiveStrip helloFrame={helloFrame} />
				<div style={{ marginTop: 30 }}>
					<Preview width={960} helloFrame={helloFrame} />
				</div>
			</AbsoluteFill>
		);
	}
	return (
		<AbsoluteFill style={{ background: PALETTE.night }}>
			<div style={{ position: "absolute", left: 70, top: 70, width: 1010 }}>
				<Code fontSize={22.5} helloFrame={helloFrame} inlineValues />
			</div>
			<div
				style={{
					position: "absolute",
					left: 1150,
					right: 70,
					top: 92,
					display: "flex",
					flexDirection: "column",
					gap: 44,
				}}
			>
				{title}
				<Preview width={700} helloFrame={helloFrame} />
				{note}
			</div>
		</AbsoluteFill>
	);
};
