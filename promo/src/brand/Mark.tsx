import { spring, useCurrentFrame, useVideoConfig } from "motio";
import { useId } from "react";
import { BRAND_SPRING, CALM_SPRING, LOGO_GEOMETRY, type Tone, toneColors } from "./tokens";

const { pivot, frame: card, gap, cards } = LOGO_GEOMETRY;
const half = gap / 2;

/** Frames the mark takes to come to rest when it plays from frame 0. */
export const MARK_SETTLE = 40;

/** A rounded frame of the mark, grown (positive) or shrunk (negative) by `grow` on every side. */
const Rect = ({ grow, fill }: { grow: number; fill: string }) => (
	<rect
		x={card.x - grow}
		y={card.y - grow}
		width={card.w + grow * 2}
		height={card.h + grow * 2}
		rx={card.r + grow}
		fill={fill}
	/>
);

export type MarkPose = { angles: [number, number, number]; scale: number };

/**
 * Where the three frames are at `frame`: they scale in over 8 frames without bounce, then fan
 * out with the brand spring, each after its own delay (the same motion as the site's logo).
 * `fold` from 0 to 1 closes the fan again, for loops and exits.
 */
export const markPose = (frame: number, fps: number, fold = 0): MarkPose => {
	const scale = spring({ frame, fps, config: CALM_SPRING, durationInFrames: 8 });
	const angles = cards.map(
		(c) => c.angle * spring({ frame, fps, delay: c.delay, config: BRAND_SPRING }) * (1 - fold),
	) as [number, number, number];
	return { angles, scale };
};

export const RESTING: MarkPose = {
	angles: cards.map((c) => c.angle) as [number, number, number],
	scale: 1,
};

type MarkProps = {
	/** Height and width of the 64-unit design box, in pixels. */
	size: number;
	tone?: Tone;
	/** A fixed pose; by default the mark plays from the current frame. */
	pose?: MarkPose;
	style?: React.CSSProperties;
};

/**
 * The Flipbook mark with transparent gaps: each frame cuts the ones behind it with an outline
 * one gap wide, and the cuts move with the frames, so the mark sits on any colour field.
 */
export const Mark = ({ size, tone = "color", pose, style }: MarkProps) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const id = useId().replace(/:/g, "");
	const { angles, scale } = pose ?? markPose(frame, fps);
	const colors = toneColors(tone);
	const place = (i: 0 | 1 | 2) =>
		`translate(${pivot.x} ${pivot.y}) rotate(${angles[i]}) scale(${scale})`;
	const area = { maskUnits: "userSpaceOnUse", x: -64, y: -64, width: 192, height: 192 } as const;
	return (
		<svg
			viewBox="0 0 64 64"
			width={size}
			height={size}
			style={{ overflow: "visible", display: "block", ...style }}
			aria-hidden="true"
		>
			<defs>
				<mask id={`${id}-back`} {...area}>
					<rect x={-64} y={-64} width={192} height={192} fill="#fff" />
					<g transform={place(1)}>
						<Rect grow={half} fill="#000" />
					</g>
					<g transform={place(2)}>
						<Rect grow={half} fill="#000" />
					</g>
				</mask>
				<mask id={`${id}-mid`} {...area}>
					<rect x={-64} y={-64} width={192} height={192} fill="#fff" />
					<g transform={place(2)}>
						<Rect grow={half} fill="#000" />
					</g>
				</mask>
			</defs>
			<g mask={`url(#${id}-back)`}>
				<g transform={place(0)}>
					<Rect grow={-half} fill={colors[0]} />
				</g>
			</g>
			<g mask={`url(#${id}-mid)`}>
				<g transform={place(1)}>
					<Rect grow={-half} fill={colors[1]} />
				</g>
			</g>
			<g transform={place(2)}>
				<Rect grow={-half} fill={colors[2]} />
			</g>
		</svg>
	);
};
