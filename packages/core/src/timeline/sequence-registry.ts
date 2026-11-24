import { createContext } from "react";
import type { TimelineState } from "./contexts.js";

/** A sequence as an editor timeline shows it, in composition frames. */
export interface TimelineSequence {
	/** Stable for the life of the sequence instance. */
	id: string;
	/** The enclosing sequence shown in the timeline, or null at the top level. */
	parentId: string | null;
	/** The `name` prop, or null. */
	name: string | null;
	/** `Sequence`, `Series.Sequence`, `Loop`, `Html5Video`... */
	componentName: string;
	/** Composition frame where the sequence starts; negative when it starts before frame 0. */
	from: number;
	/** Composition frames it lasts, `Infinity` when unbounded; cut at the parent's end. */
	durationInFrames: number;
	/** Composition frames of one iteration of a looping sequence, else null. */
	loopDurationInFrames: number | null;
	/** The `hidden` prop: it renders nothing. */
	hidden: boolean;
}

/**
 * Collects the sequences of the composition shown in an editor (the `motio dev` preview), for
 * its timeline. Sequences outside their range register too; nested ones register while their
 * parent renders. Absent (null context) during renders and in a plain Player.
 */
export class SequenceRegistry {
	private readonly entries = new Map<string, TimelineSequence>();
	private readonly listeners = new Set<() => void>();
	private snapshot: TimelineSequence[] = [];

	/** Adds or updates a sequence; listeners hear only real changes. */
	set(entry: TimelineSequence): void {
		const existing = this.entries.get(entry.id);
		if (existing && sameSequence(existing, entry)) return;
		this.entries.set(entry.id, entry);
		this.changed();
	}

	remove(id: string): void {
		if (this.entries.delete(id)) this.changed();
	}

	/** The sequences in registration order; the same array until something changes. */
	list = (): TimelineSequence[] => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private changed(): void {
		this.snapshot = [...this.entries.values()];
		for (const listener of [...this.listeners]) listener();
	}
}

function sameSequence(a: TimelineSequence, b: TimelineSequence): boolean {
	return (
		a.parentId === b.parentId &&
		a.name === b.name &&
		a.componentName === b.componentName &&
		a.from === b.from &&
		a.durationInFrames === b.durationInFrames &&
		a.loopDurationInFrames === b.loopDurationInFrames &&
		a.hidden === b.hidden
	);
}

/** Provided by the preview around its Player; null everywhere else. */
export const SequenceRegistryContext = createContext<SequenceRegistry | null>(null);

/** The id of the enclosing registered sequence, for nesting. */
export const SequenceParentContext = createContext<string | null>(null);

/** Timing props the placement reads. */
export interface SequencePlacementProps {
	from?: number | undefined;
	durationInFrames?: number | undefined;
	playbackRate?: number | undefined;
	loop?: boolean | undefined;
}

/**
 * Where a sequence sits in composition frames, from its parent's timeline (which maps
 * composition frames to the parent's frames) and its timing props. Inside a looping parent the
 * result follows the current iteration. Null when the parent does not advance (rate 0).
 */
export function sequencePlacement(
	parent: TimelineState,
	props: SequencePlacementProps,
): Pick<TimelineSequence, "from" | "durationInFrames" | "loopDurationInFrames"> | null {
	if (!(parent.mapRate > 0)) return null;
	const from = props.from ?? 0;
	const duration = props.durationInFrames ?? Number.POSITIVE_INFINITY;
	const rate = props.playbackRate ?? 1;
	const loop = props.loop === true;
	const localEnd = loop
		? parent.durationInFrames
		: Math.min(from + duration / rate, parent.durationInFrames);
	const toAbsolute = (local: number) => (local - parent.mapOffset) / parent.mapRate;
	const start = toAbsolute(from);
	const end = toAbsolute(localEnd);
	return {
		from: start,
		durationInFrames: Math.max(0, end - start),
		loopDurationInFrames: loop ? duration / rate / parent.mapRate : null,
	};
}
