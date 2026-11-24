import { MONO } from "./fonts";
import { PALETTE } from "./tokens";

type RulerProps = {
	/** Pixels between two frames. */
	step: number;
	/** Frames drawn, from 0. */
	frames: number;
	/** Where the playhead stands, in frames (fractional while it moves). */
	playhead: number;
	height: number;
	/** Colour of the ticks and labels. */
	ink: string;
	labelSize?: number;
};

/**
 * A timeline ruler: a tick per frame, a label every ten, and the Pulse playhead with the current
 * frame number, as in the hero of the website.
 */
export const Ruler = ({ step, frames, playhead, height, ink, labelSize = 15 }: RulerProps) => {
	const ticks = Array.from({ length: frames + 1 }, (_, f) => f);
	const shown = Math.round(playhead);
	const x = playhead * step;
	return (
		<div style={{ position: "relative", height, width: frames * step + 1 }}>
			<svg
				width={frames * step + 1}
				height={height}
				style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
				aria-hidden="true"
			>
				{ticks.map((f) => {
					const major = f % 10 === 0;
					const mid = f % 5 === 0;
					const h = major ? height * 0.5 : mid ? height * 0.32 : height * 0.22;
					return (
						<rect
							key={f}
							x={f * step}
							y={height - h}
							width={major ? 2 : 1}
							height={h}
							fill={ink}
							opacity={major ? 0.7 : 0.38}
						/>
					);
				})}
				<rect x={x - 1.5} y={height * 0.3} width={3} height={height * 0.7} fill={PALETTE.pulse} />
			</svg>
			{ticks
				// A label under the playhead's tag would collide with it.
				.filter((f) => f % 10 === 0 && Math.abs(f - playhead) * step > labelSize * 2.6)
				.map((f) => (
					<span
						key={f}
						style={{
							position: "absolute",
							left: f * step + 4,
							top: 0,
							fontFamily: MONO,
							fontWeight: 500,
							fontSize: labelSize,
							lineHeight: 1,
							color: ink,
							opacity: 0.75,
						}}
					>
						{f}
					</span>
				))}
			<span
				style={{
					position: "absolute",
					left: x,
					top: -labelSize * 0.35,
					translate: "-50% 0",
					padding: `${labelSize * 0.25}px ${labelSize * 0.45}px`,
					borderRadius: labelSize * 0.3,
					background: PALETTE.pulse,
					color: PALETTE.plum,
					fontFamily: MONO,
					fontWeight: 600,
					fontSize: labelSize,
					lineHeight: 1,
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{shown}
			</span>
		</div>
	);
};
