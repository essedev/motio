import { forwardRef, type HTMLAttributes } from "react";
import { absoluteFillStyle } from "./absolute-fill-style.js";
import { SequenceBase, type SequenceTimingProps } from "./sequence.js";

/** Props of `<AbsoluteFill>`: every `<div>` attribute plus the timing props of `Sequence`. */
export interface AbsoluteFillProps
	extends Omit<HTMLAttributes<HTMLDivElement>, "hidden">,
		SequenceTimingProps {}

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"hidden",
	"name",
	"showInTimeline",
	"premountFor",
	"postmountFor",
	"styleWhilePremounted",
	"styleWhilePostmounted",
] as const satisfies ReadonlyArray<keyof SequenceTimingProps>;

/**
 * An absolutely positioned `<div>` filling its parent, laid out as a flex column. Later layers
 * stack on top. With timing props it behaves like a `Sequence` whose container is this div.
 */
export const AbsoluteFill = forwardRef<HTMLDivElement, AbsoluteFillProps>(
	function AbsoluteFill(props, ref) {
		const timing: SequenceTimingProps = {};
		const rest: HTMLAttributes<HTMLDivElement> & Record<string, unknown> = {};
		let timed = false;
		for (const [key, value] of Object.entries(props)) {
			if ((TIMING_KEYS as readonly string[]).includes(key)) {
				if (value !== undefined) {
					(timing as Record<string, unknown>)[key] = value;
					// `name` and `showInTimeline` alone do not make the fill a sequence.
					if (key !== "name" && key !== "showInTimeline") timed = true;
				}
			} else {
				rest[key] = value;
			}
		}
		const { style, className, children, ...divProps } = rest;
		if (!timed) {
			return (
				<div
					{...divProps}
					ref={ref}
					className={className}
					style={{ ...absoluteFillStyle(className), ...style }}
				>
					{children}
				</div>
			);
		}
		return (
			<SequenceBase
				{...timing}
				ref={ref}
				layout="absolute-fill"
				componentName="AbsoluteFill"
				containerProps={divProps}
				{...(style !== undefined ? { style } : null)}
				{...(className !== undefined ? { className } : null)}
			>
				{children}
			</SequenceBase>
		);
	},
);
