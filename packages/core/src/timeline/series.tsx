import {
	Children,
	type CSSProperties,
	Fragment,
	forwardRef,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type Ref,
} from "react";
import { SequenceBase, type SequenceProps } from "./sequence.js";

/** Props of `<Series.Sequence>`. */
export interface SeriesSequenceProps {
	/** Frames of the child timeline shown; only the last sequence may be `Infinity`. */
	durationInFrames: number;
	/** Shifts this and every later sequence; negative overlaps the previous one. Default 0. */
	offset?: number;
	trimBefore?: number;
	playbackRate?: number;
	freeze?: number | null;
	hidden?: boolean;
	name?: string;
	layout?: "absolute-fill" | "none";
	style?: CSSProperties;
	className?: string;
	showInTimeline?: boolean;
	premountFor?: number;
	postmountFor?: number;
	styleWhilePremounted?: CSSProperties;
	styleWhilePostmounted?: CSSProperties;
	children?: ReactNode;
}

/** Marker component: only valid as a direct child of `<Series>`. */
const SeriesSequence = forwardRef<HTMLDivElement, SeriesSequenceProps>(
	function SeriesSequence(): never {
		throw new Error("<Series.Sequence> can only be used as a direct child of <Series>.");
	},
);

/** Props of `<Series>`: every `Sequence` prop, with `layout` defaulting to `"none"`. */
export type SeriesProps = SequenceProps;

function flatten(children: ReactNode, out: ReactElement[] = []): ReactElement[] {
	Children.forEach(children, (child) => {
		if (child === null || child === undefined || typeof child === "boolean") return;
		if (isValidElement(child) && child.type === Fragment) {
			flatten((child.props as { children?: ReactNode }).children, out);
			return;
		}
		if (!isValidElement(child) || child.type !== SeriesSequence) {
			throw new Error(
				`<Series> only accepts <Series.Sequence> children, got ${
					isValidElement(child) ? "another element" : JSON.stringify(child)
				}.`,
			);
		}
		out.push(child);
	});
	return out;
}

/** The ref of an element, in React 19 (a prop) and React 18 (a field). */
function elementRef(el: ReactElement): Ref<HTMLDivElement> | undefined {
	const props = el.props as { ref?: Ref<HTMLDivElement> };
	if ("ref" in props) return props.ref;
	return (el as unknown as { ref?: Ref<HTMLDivElement> }).ref ?? undefined;
}

const SeriesImpl = forwardRef<HTMLDivElement, SeriesProps>(function Series(props, ref) {
	const { children, layout = "none", ...sequenceProps } = props;
	const items = flatten(children);
	let start = 0;
	const placed = items.map((item, i) => {
		const {
			durationInFrames,
			offset = 0,
			playbackRate = 1,
			layout: itemLayout = "absolute-fill",
			children: itemChildren,
			...rest
		} = item.props as SeriesSequenceProps & { ref?: unknown };
		delete (rest as { ref?: unknown }).ref;
		const last = i === items.length - 1;
		if (typeof durationInFrames !== "number" || Number.isNaN(durationInFrames)) {
			throw new Error(
				`<Series.Sequence>: "durationInFrames" must be a number, got ${String(durationInFrames)}.`,
			);
		}
		if (!last && !Number.isFinite(durationInFrames)) {
			throw new Error(
				`<Series.Sequence>: only the last sequence may have an infinite "durationInFrames" (sequence ${i + 1} of ${items.length}).`,
			);
		}
		if (
			Number.isFinite(durationInFrames) &&
			(!Number.isInteger(durationInFrames) || durationInFrames <= 0)
		) {
			throw new Error(
				`<Series.Sequence>: "durationInFrames" must be a positive integer, got ${durationInFrames}.`,
			);
		}
		if (typeof offset !== "number" || !Number.isFinite(offset)) {
			throw new Error(
				`<Series.Sequence>: "offset" must be a finite number, got ${String(offset)}.`,
			);
		}
		start += offset;
		const from = start;
		start += durationInFrames / playbackRate;
		return (
			<SequenceBase
				key={item.key ?? i}
				{...rest}
				ref={elementRef(item)}
				componentName="Series.Sequence"
				layout={itemLayout}
				from={from}
				durationInFrames={durationInFrames}
				playbackRate={playbackRate}
			>
				{itemChildren}
			</SequenceBase>
		);
	});
	return (
		<SequenceBase {...sequenceProps} ref={ref} layout={layout} componentName="Series">
			{placed}
		</SequenceBase>
	);
});

/** Plays its `<Series.Sequence>` children one after another. */
export const Series: typeof SeriesImpl & { Sequence: typeof SeriesSequence } = Object.assign(
	SeriesImpl,
	{ Sequence: SeriesSequence },
);
