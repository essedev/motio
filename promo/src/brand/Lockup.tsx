import { spring, useCurrentFrame, useVideoConfig } from "motio";
import { DISPLAY } from "./fonts";
import { Mark } from "./Mark";
import { BRAND_SPRING, LOGO_GEOMETRY, type Tone } from "./tokens";

type LockupProps = {
	/** Font size of the wordmark; the mark is 1.18 em, 0.22 em away from it. */
	size: number;
	tone?: Tone;
	ink: string;
	style?: React.CSSProperties;
};

/**
 * Mark and wordmark, as in the brand kit: Anybody 800, width 112, tracking -0.015 em. It plays
 * from frame 0: the frames fan out, then the letters rise one after another.
 */
export const Lockup = ({ size, tone = "color", ink, style }: LockupProps) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: size * 0.22,
				fontFamily: DISPLAY,
				fontWeight: 800,
				fontStretch: "112%",
				fontSize: size,
				lineHeight: 1,
				letterSpacing: "-0.015em",
				color: ink,
				...style,
			}}
		>
			<Mark size={size * 1.18} tone={tone} />
			<span
				style={{
					display: "inline-flex",
					overflow: "hidden",
					padding: "0.06em 0.02em 0.14em",
					margin: "-0.06em 0 -0.14em",
				}}
			>
				{[..."motio"].map((ch, i) => {
					const rise = spring({
						frame,
						fps,
						delay: LOGO_GEOMETRY.letterDelay(i),
						config: BRAND_SPRING,
					});
					return (
						<span
							key={`${ch}-${i.toString()}`}
							style={{ display: "inline-block", translate: `0 ${(1 - rise) * 110}%` }}
						>
							{ch}
						</span>
					);
				})}
			</span>
		</div>
	);
};
