import type { TransitionPresentation, TransitionTiming } from "./types.js";

/** A child of `<TransitionSeries>`, reduced to what the layout needs. */
export type LayoutItem =
	| {
			kind: "sequence";
			/** Frames of the scene's own timeline; only the last scene may be `Infinity`. */
			durationInFrames: number;
			/** Shifts this and every later item. Default 0. */
			offset?: number | undefined;
			/** Speed of the scene. Default 1. */
			playbackRate?: number | undefined;
	  }
	| {
			kind: "transition";
			timing: TransitionTiming;
			presentation: TransitionPresentation<Record<string, unknown>>;
	  }
	| {
			kind: "overlay";
			durationInFrames: number;
			offset?: number | undefined;
	  };

/** A transition attached to one side of a scene, in frames of the series. */
export interface PlacedTransition {
	/** First frame of the transition. */
	start: number;
	/** Length of the transition in frames. */
	durationInFrames: number;
	timing: TransitionTiming;
	presentation: TransitionPresentation<Record<string, unknown>>;
}

/** Where a scene sits in the series. */
export interface PlacedSequence {
	/** Index of the item among the children of the series. */
	index: number;
	/** First frame of the scene, in frames of the series. */
	from: number;
	/** Frames the scene occupies in the series (its duration divided by its playback rate). */
	length: number;
	/** The transition the scene comes in with, if any. */
	enter: PlacedTransition | null;
	/** The transition the scene goes out with, if any. */
	exit: PlacedTransition | null;
}

/** Where an overlay sits in the series. */
export interface PlacedOverlay {
	index: number;
	from: number;
	durationInFrames: number;
}

/** The result of `layoutTransitionSeries()`. */
export interface TransitionSeriesLayout {
	sequences: PlacedSequence[];
	overlays: PlacedOverlay[];
	/** Frame after the last frame of the latest scene or overlay. */
	durationInFrames: number;
}

function fail(component: string, message: string): never {
	throw new Error(`<${component}>: ${message}`);
}

function isInteger(v: unknown): v is number {
	return typeof v === "number" && Number.isInteger(v);
}

function transitionDuration(item: Extract<LayoutItem, { kind: "transition" }>, fps: number) {
	const duration = item.timing.getDurationInFrames({ fps });
	if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
		fail(
			"TransitionSeries.Transition",
			`the timing must have a non-negative finite duration, got ${String(duration)}.`,
		);
	}
	return duration;
}

/**
 * Places the scenes, transitions and overlays of a `<TransitionSeries>`. Scenes follow each
 * other like in `<Series>`; a transition between two scenes makes the second one start that many
 * frames earlier, so both are shown during the transition; a transition before the first scene
 * or after the last one animates its entrance or exit without moving it. Overlays are centred on
 * the cut between their neighbours and do not move anything. Throws for every invalid
 * arrangement.
 */
export function layoutTransitionSeries(
	items: readonly LayoutItem[],
	fps: number,
): TransitionSeriesLayout {
	const sequences: PlacedSequence[] = [];
	const overlays: PlacedOverlay[] = [];
	const sequenceCount = items.filter((i) => i.kind === "sequence").length;
	const lastSequenceIndex = items.findLastIndex((i) => i.kind === "sequence");

	// Validate the arrangement before computing anything.
	items.forEach((item, i) => {
		const prev = items[i - 1];
		if (item.kind === "sequence") {
			const { durationInFrames, offset = 0 } = item;
			if (typeof durationInFrames !== "number" || Number.isNaN(durationInFrames)) {
				fail(
					"TransitionSeries.Sequence",
					`"durationInFrames" must be a number, got ${String(durationInFrames)}.`,
				);
			}
			if (!Number.isFinite(durationInFrames) && i !== lastSequenceIndex) {
				fail(
					"TransitionSeries.Sequence",
					`only the last sequence may have an infinite "durationInFrames".`,
				);
			}
			if (
				Number.isFinite(durationInFrames) &&
				(!Number.isInteger(durationInFrames) || durationInFrames <= 0)
			) {
				fail(
					"TransitionSeries.Sequence",
					`"durationInFrames" must be a positive integer, got ${durationInFrames}.`,
				);
			}
			if (!isInteger(offset)) {
				fail("TransitionSeries.Sequence", `"offset" must be an integer, got ${String(offset)}.`);
			}
			return;
		}
		const name =
			item.kind === "transition" ? "TransitionSeries.Transition" : "TransitionSeries.Overlay";
		if (sequenceCount === 0) {
			fail(name, "there must be at least one <TransitionSeries.Sequence> before or after it.");
		}
		if (prev && prev.kind !== "sequence") {
			const prevName = prev.kind === "transition" ? "transition" : "overlay";
			const thisName = item.kind === "transition" ? "transition" : "overlay";
			if (prevName === thisName) {
				fail(name, `two ${thisName}s cannot be next to each other; put a sequence between them.`);
			}
			fail(
				name,
				"a transition and an overlay cannot be next to each other: they take the same place between two sequences.",
			);
		}
		if (item.kind === "overlay") {
			const { durationInFrames, offset = 0 } = item;
			if (!isInteger(durationInFrames) || durationInFrames <= 0) {
				fail(
					name,
					`"durationInFrames" must be a positive integer, got ${String(durationInFrames)}.`,
				);
			}
			if (!isInteger(offset)) {
				fail(name, `"offset" must be a finite integer, got ${String(offset)}.`);
			}
		}
	});

	let cursor = 0;
	let pending: PlacedTransition | null = null;
	let lastSequence: PlacedSequence | null = null;
	const overlayAt: Array<{ index: number; item: Extract<LayoutItem, { kind: "overlay" }> }> = [];
	const cutBefore = new Map<number, PlacedSequence | null>();

	items.forEach((item, index) => {
		if (item.kind === "transition") {
			const durationInFrames = transitionDuration(item, fps);
			if (lastSequence && !Number.isFinite(lastSequence.length)) {
				fail(
					"TransitionSeries.Transition",
					"a transition cannot follow a sequence with an infinite duration.",
				);
			}
			if (lastSequence && durationInFrames > lastSequence.length) {
				fail(
					"TransitionSeries.Transition",
					`the transition lasts ${durationInFrames} frames, longer than the previous sequence (${lastSequence.length} frames).`,
				);
			}
			pending = {
				start: 0,
				durationInFrames,
				timing: item.timing,
				presentation: item.presentation,
			};
			if (lastSequence) {
				lastSequence.exit = {
					...pending,
					start: lastSequence.from + lastSequence.length - durationInFrames,
				};
			}
			return;
		}
		if (item.kind === "overlay") {
			overlayAt.push({ index, item });
			cutBefore.set(index, lastSequence);
			return;
		}
		const rate = item.playbackRate ?? 1;
		const length = item.durationInFrames / rate;
		const enter: PlacedTransition | null = pending;
		pending = null;
		let from = cursor + (item.offset ?? 0);
		if (enter && lastSequence) from -= enter.durationInFrames;
		if (enter && enter.durationInFrames > length) {
			fail(
				"TransitionSeries.Transition",
				`the transition lasts ${enter.durationInFrames} frames, longer than the next sequence (${length} frames).`,
			);
		}
		const placed: PlacedSequence = {
			index,
			from,
			length,
			enter: enter ? { ...enter, start: from } : null,
			exit: null,
		};
		sequences.push(placed);
		lastSequence = placed;
		cursor = from + length;
	});

	for (const { index, item } of overlayAt) {
		const prev = cutBefore.get(index) ?? null;
		const next = sequences.find((s) => s.index > index) ?? null;
		const cut = prev ? prev.from + prev.length : (next as PlacedSequence).from;
		if (prev && !Number.isFinite(cut)) {
			fail(
				"TransitionSeries.Overlay",
				"an overlay cannot follow a sequence with an infinite duration.",
			);
		}
		const from = cut - Math.floor(item.durationInFrames / 2) + (item.offset ?? 0);
		const end = from + item.durationInFrames;
		const earliest = Math.max(0, prev ? prev.from : (next as PlacedSequence).from);
		const latest = next
			? next.from + next.length
			: (prev as PlacedSequence).from + (prev as PlacedSequence).length;
		if (from < earliest || end > latest) {
			fail(
				"TransitionSeries.Overlay",
				`the overlay spans frames ${from} to ${end}, outside of its adjacent sequences (${earliest} to ${latest}). Shorten it or change its "offset".`,
			);
		}
		overlays.push({ index, from, durationInFrames: item.durationInFrames });
	}

	const ends = [
		0,
		...sequences.map((s) => s.from + s.length),
		...overlays.map((o) => o.from + o.durationInFrames),
	];
	return { sequences, overlays, durationInFrames: Math.max(...ends) };
}
