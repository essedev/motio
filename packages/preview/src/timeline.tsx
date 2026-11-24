import type { SequenceRegistry, TimelineSequence } from "@motiojs/core/internals";
import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { FrameStore } from "./frame-store.js";
import { useElementSize } from "./hooks.js";
import type { LoopRange } from "./range.js";
import { clampFrame, formatTimecode } from "./time.js";

/** A sequence placed on its row, with its depth in the tree. */
export interface TimelineRow {
	sequence: TimelineSequence;
	depth: number;
	label: string;
}

/** Shortest distance between two ruler labels, in pixels. */
const MIN_TICK_SPACING_PX = 64;

/**
 * Orders the registered sequences as a tree: each under its parent (or at the top level when
 * the parent is not listed), siblings by start frame then registration order.
 */
export function timelineRows(sequences: readonly TimelineSequence[]): TimelineRow[] {
	const ids = new Set(sequences.map((s) => s.id));
	const order = new Map(sequences.map((s, i) => [s.id, i]));
	const children = new Map<string | null, TimelineSequence[]>();
	for (const sequence of sequences) {
		const parent =
			sequence.parentId !== null && ids.has(sequence.parentId) ? sequence.parentId : null;
		const list = children.get(parent);
		if (list) list.push(sequence);
		else children.set(parent, [sequence]);
	}
	const rows: TimelineRow[] = [];
	const visit = (parent: string | null, depth: number) => {
		const list = [...(children.get(parent) ?? [])].sort(
			(a, b) => a.from - b.from || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
		);
		for (const sequence of list) {
			rows.push({ sequence, depth, label: sequence.name ?? sequence.componentName });
			visit(sequence.id, depth + 1);
		}
	};
	visit(null, 0);
	return rows;
}

/** How long a remembered sequence may stay missing while its parent renders before it is dropped. */
const FORGET_AFTER_MS = 400;

interface Remembered {
	sequence: TimelineSequence;
	/** Start relative to the parent's, so it follows the parent when that moves. */
	offset: number;
	/** When it was first missing while its parent rendered, or null. */
	missingSince: number | null;
}

const contains = (s: TimelineSequence, frame: number) =>
	frame >= s.from && frame < s.from + s.durationInFrames;

/**
 * Keeps the rows of nested sequences while their parent is out of range. A nested sequence
 * registers only while its parent renders it, so without this its row would vanish and come
 * back as the playhead leaves and re-enters the parent. A remembered sequence is shown while
 * the playhead is outside its parent, and dropped when the parent is gone or renders without it
 * (it was deleted, or is rendered conditionally).
 */
export class SequenceMemory {
	private remembered = new Map<string, Remembered>();
	private lastSeen = new Map<string, TimelineSequence>();

	/** The registered sequences plus the remembered ones to show at `frame`. */
	resolve(current: readonly TimelineSequence[], frame: number, now: number): TimelineSequence[] {
		const byId = new Map(current.map((s) => [s.id, s]));
		for (const s of current) this.remembered.delete(s.id);
		// Sequences that just left: remember those whose parent is still known.
		for (const [id, s] of this.lastSeen) {
			if (byId.has(id) || this.remembered.has(id) || s.parentId === null) continue;
			const parent = byId.get(s.parentId) ?? this.lastSeen.get(s.parentId);
			if (parent)
				this.remembered.set(id, { sequence: s, offset: s.from - parent.from, missingSince: null });
		}
		const shown: TimelineSequence[] = [];
		const resolved = new Map(byId);
		// Parents before children: a remembered child may hang under a remembered parent.
		let progress = true;
		const pending = new Map(this.remembered);
		while (progress && pending.size > 0) {
			progress = false;
			for (const [id, entry] of pending) {
				const parent = resolved.get(entry.sequence.parentId as string);
				if (!parent && pending.has(entry.sequence.parentId as string)) continue;
				pending.delete(id);
				progress = true;
				if (!parent) {
					this.remembered.delete(id);
					continue;
				}
				const sequence = { ...entry.sequence, from: parent.from + entry.offset };
				const parentRendersNow = byId.has(parent.id) && contains(parent, frame);
				if (parentRendersNow) {
					entry.missingSince ??= now;
					if (now - entry.missingSince > FORGET_AFTER_MS) {
						this.remembered.delete(id);
						continue;
					}
				} else entry.missingSince = null;
				resolved.set(id, sequence);
				shown.push(sequence);
			}
		}
		for (const id of pending.keys()) this.remembered.delete(id);
		this.lastSeen = resolved;
		return [...current, ...shown];
	}
}

/** Ruler ticks: a step in frames that keeps labels at least {@link MIN_TICK_SPACING_PX} apart. */
export function rulerTicks(
	durationInFrames: number,
	fps: number,
	widthPx: number,
): { step: number; frames: number[]; inSeconds: boolean } {
	const perFrame = widthPx / Math.max(1, durationInFrames);
	const second = Math.max(1, Math.round(fps));
	const candidates = [
		1,
		2,
		5,
		10,
		15,
		...[1, 2, 5, 10, 15, 30, 60, 120, 300, 600].map((s) => s * second),
	]
		.filter((step, i, all) => all.indexOf(step) === i)
		.sort((a, b) => a - b);
	const step =
		candidates.find((c) => c * perFrame >= MIN_TICK_SPACING_PX) ?? (candidates.at(-1) as number);
	const frames: number[] = [];
	for (let f = 0; f < durationInFrames; f += step) frames.push(f);
	return { step, frames, inSeconds: step % second === 0 };
}

function tickLabel(frame: number, fps: number, inSeconds: boolean): string {
	if (!inSeconds) return String(frame);
	const seconds = Math.round(frame / fps);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Where a sequence's bar sits, cut to the composition: left and width as fractions. */
export function barPlacement(
	sequence: TimelineSequence,
	durationInFrames: number,
): { left: number; width: number; cutStart: boolean; cutEnd: boolean } | null {
	const start = Math.max(0, sequence.from);
	const end = Math.min(durationInFrames, sequence.from + sequence.durationInFrames);
	if (!(end > start)) return null;
	return {
		left: start / durationInFrames,
		width: (end - start) / durationInFrames,
		cutStart: sequence.from < 0,
		cutEnd: sequence.from + sequence.durationInFrames > durationInFrames,
	};
}

function describeSpan(sequence: TimelineSequence, durationInFrames: number): string {
	const first = Math.max(0, Math.ceil(sequence.from));
	const last = Math.min(durationInFrames, sequence.from + sequence.durationInFrames) - 1;
	return last < first ? "outside the composition" : `frames ${first} to ${Math.floor(last)}`;
}

const isMedia = (name: string) => /video|audio|gif|lottie|image/i.test(name);

interface TimelineProps {
	registry: SequenceRegistry;
	store: FrameStore;
	fps: number;
	durationInFrames: number;
	range: LoopRange;
	expanded: boolean;
	onExpandedChange(expanded: boolean): void;
	/** Seeks without changing the play state. */
	onSeek(frame: number): void;
	/** Called when a scrub starts: the page pauses playback. */
	onScrubStart(): void;
}

/**
 * The timeline under the stage: a ruler to scrub (pointer or keyboard), the loop range, the
 * playhead, and one row per `<Sequence>` (with its `name`), `<Series.Sequence>`, `<Loop>` and
 * timed media component the composition renders. Rows nest as the components do.
 */
export function Timeline(props: TimelineProps) {
	const { registry, store, fps, durationInFrames, range } = props;
	const sequences = useSyncExternalStore(registry.subscribe, registry.list, registry.list);
	const { frame } = useSyncExternalStore(store.subscribe, store.get, store.get);
	const [memory] = useState(() => new SequenceMemory());
	const all = memory.resolve(sequences, Math.min(frame, durationInFrames - 1), performance.now());
	const rows = timelineRows(all);
	const [rulerRef, ruler] = useElementSize();
	const rulerElement = useRef<HTMLDivElement | null>(null);
	const ticks = rulerTicks(durationInFrames, fps, ruler.w);
	const last = durationInFrames - 1;
	const current = Math.min(frame, last);
	const fraction = (f: number) => `${(f / durationInFrames) * 100}%`;

	const frameAt = (clientX: number) => {
		const rect = rulerElement.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return current;
		return clampFrame(
			((clientX - rect.left) / rect.width) * durationInFrames - 0.5,
			durationInFrames,
		);
	};
	const scrubbing = useRef(false);
	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		scrubbing.current = true;
		e.currentTarget.setPointerCapture?.(e.pointerId);
		props.onScrubStart();
		props.onSeek(frameAt(e.clientX));
	};
	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		if (scrubbing.current) props.onSeek(frameAt(e.clientX));
	};
	const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
		scrubbing.current = false;
		e.currentTarget.releasePointerCapture?.(e.pointerId);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.shiftKey ? Math.max(1, Math.round(fps)) : 1;
		const target =
			e.key === "ArrowLeft" || e.key === "ArrowDown"
				? current - step
				: e.key === "ArrowRight" || e.key === "ArrowUp"
					? current + step
					: e.key === "PageDown"
						? current - Math.max(1, Math.round(fps))
						: e.key === "PageUp"
							? current + Math.max(1, Math.round(fps))
							: e.key === "Home"
								? 0
								: e.key === "End"
									? last
									: null;
		if (target === null) return;
		// Handled here: the page's global shortcuts skip prevented events.
		e.preventDefault();
		props.onScrubStart();
		props.onSeek(clampFrame(target, durationInFrames));
	};

	const inFrame = range.inFrame ?? 0;
	const outFrame = range.outFrame ?? last;
	const hasRange = range.inFrame !== null || range.outFrame !== null;
	const scrub = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

	return (
		<section className="mp-timeline" aria-label="Timeline" data-testid="timeline">
			<div className="mp-tl-grid">
				<div className="mp-tl-corner">
					<button
						type="button"
						className="mp-tl-toggle"
						aria-expanded={props.expanded}
						aria-controls="mp-tl-rows"
						onClick={() => props.onExpandedChange(!props.expanded)}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
							<path d="M5 3l6 5-6 5z" />
						</svg>
						Sequences
						<span className="mp-count">{rows.length}</span>
					</button>
				</div>
				<div
					ref={(element) => {
						rulerElement.current = element;
						rulerRef(element);
					}}
					className="mp-tl-ruler"
					role="slider"
					tabIndex={0}
					aria-label="Playhead"
					aria-valuemin={0}
					aria-valuemax={last}
					aria-valuenow={current}
					aria-valuetext={`Frame ${current}, ${formatTimecode(current, fps)}`}
					data-testid="timeline-ruler"
					onKeyDown={onKeyDown}
					{...scrub}
				>
					{hasRange ? (
						<div
							className="mp-tl-range"
							style={{ left: fraction(inFrame), width: fraction(outFrame - inFrame + 1) }}
						/>
					) : null}
					{ticks.frames.map((f) => (
						<span key={f} className="mp-tl-tick" style={{ left: fraction(f) }}>
							{tickLabel(f, fps, ticks.inSeconds)}
						</span>
					))}
					<div className="mp-tl-head" style={{ left: fraction(current + 0.5) }} />
				</div>
			</div>
			{props.expanded ? (
				<div className="mp-tl-rows" id="mp-tl-rows">
					<div className="mp-tl-content">
						{rows.length === 0 ? (
							<p className="mp-tl-empty">
								No sequences in this composition. Each <code>&lt;Sequence&gt;</code> gets a row,
								labelled with its <code>name</code>.
							</p>
						) : (
							<ul className="mp-tl-grid mp-tl-list">
								{rows.map(({ sequence, depth, label }) => {
									const bar = barPlacement(sequence, durationInFrames);
									const span = describeSpan(sequence, durationInFrames);
									const active =
										!sequence.hidden &&
										current >= sequence.from &&
										current < sequence.from + sequence.durationInFrames;
									return (
										<li key={sequence.id} style={{ display: "contents" }}>
											<div
												className="mp-tl-label"
												style={{ paddingLeft: 10 + depth * 12 }}
												title={`${label} (${sequence.componentName}), ${span}`}
											>
												{label}
											</div>
											<div className="mp-tl-lane" {...scrub}>
												{bar ? (
													<button
														type="button"
														className="mp-tl-bar"
														data-media={isMedia(sequence.componentName) || undefined}
														data-hidden={sequence.hidden || undefined}
														data-active={active || undefined}
														data-cut-start={bar.cutStart || undefined}
														data-cut-end={bar.cutEnd || undefined}
														style={{
															left: `${bar.left * 100}%`,
															width: `${bar.width * 100}%`,
															...(sequence.loopDurationInFrames
																? {
																		backgroundSize: `${(sequence.loopDurationInFrames / (sequence.durationInFrames || 1)) * 100}% 100%`,
																	}
																: null),
														}}
														data-loop={sequence.loopDurationInFrames ? true : undefined}
														aria-label={`${label}${sequence.hidden ? " (hidden)" : ""}, ${span}. Go to its first frame.`}
														onPointerDown={(e) => e.stopPropagation()}
														onClick={() => {
															props.onScrubStart();
															props.onSeek(clampFrame(sequence.from, durationInFrames));
														}}
													>
														<span>{label}</span>
													</button>
												) : null}
											</div>
										</li>
									);
								})}
							</ul>
						)}
						<div
							className="mp-tl-playline"
							aria-hidden="true"
							style={{ "--mp-at": `${(current + 0.5) / durationInFrames}` } as CSSProperties}
						/>
					</div>
				</div>
			) : null}
		</section>
	);
}
