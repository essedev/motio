import { BufferTracker } from "./buffer.js";
import type { PlayerEmitter } from "./emitter.js";
import {
	advance,
	framesElapsed,
	type PlaybackRange,
	playbackRange,
	startFrameForPlay,
} from "./frame-math.js";
import { type MediaClock, MediaStartGate } from "./media-start.js";
import type { PlayerEventTypes } from "./types.js";
import { validateVolume } from "./validate.js";

/** The props that drive playback; updated on every Player render. */
export interface PlaybackOptions {
	fps: number;
	durationInFrames: number;
	inFrame: number | null;
	outFrame: number | null;
	loop: boolean;
	playbackRate: number;
	moveToBeginningWhenEnded: boolean;
}

/** What the Player UI renders from. Replaced (never mutated) on every change. */
export interface PlaybackSnapshot {
	frame: number;
	playing: boolean;
	/** At least one `delayPlayback()` handle is open. */
	buffering: boolean;
	/** Playback started at least once. */
	hasPlayed: boolean;
	/** Playback stopped at the end and nothing moved since. */
	ended: boolean;
	/** The seek bar is being dragged. */
	scrubbing: boolean;
	volume: number;
	muted: boolean;
}

/** Minimum real time between two `timeupdate` events. */
export const TIME_UPDATE_INTERVAL_MS = 250;

function now(): number {
	return performance.now();
}

/**
 * The playback state machine of one Player. Runs on the real clock: while playing, every
 * animation frame computes the frame from the real time elapsed since the last anchor (play,
 * seek, rate change or buffering), so the frame rate of the display does not affect timing.
 */
export class PlaybackStore {
	private options: PlaybackOptions;
	private snapshot: PlaybackSnapshot;
	private readonly listeners = new Set<() => void>();
	private readonly buffer: BufferTracker;
	private anchorTime = 0;
	private anchorFrame = 0;
	private playStartFrame = 0;
	private rafId: number | null = null;
	private lastTimeUpdate = Number.NEGATIVE_INFINITY;
	private attached = true;
	private readonly mediaStart = new MediaStartGate();
	private mediaElements: () => Iterable<MediaClock> = () => [];

	constructor(
		options: PlaybackOptions,
		init: { frame: number; volume: number; muted: boolean },
		private readonly emitter: PlayerEmitter<PlayerEventTypes>,
	) {
		this.options = options;
		this.buffer = new BufferTracker((buffering) => this.onBufferChange(buffering));
		this.snapshot = {
			frame: init.frame,
			playing: false,
			buffering: false,
			hasPlayed: false,
			ended: false,
			scrubbing: false,
			volume: init.volume,
			muted: init.muted,
		};
	}

	/**
	 * Tells the store how to find the media elements the composition plays, so the clock can
	 * wait for them to start (see {@link MediaStartGate}).
	 */
	setMediaElements(list: () => Iterable<MediaClock>): void {
		this.mediaElements = list;
	}

	/** The value given to `BufferStateContext`. */
	get bufferState() {
		return this.buffer.state;
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getSnapshot = (): PlaybackSnapshot => this.snapshot;

	private update(patch: Partial<PlaybackSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		for (const l of [...this.listeners]) l();
	}

	private get range(): PlaybackRange {
		const { durationInFrames, inFrame, outFrame } = this.options;
		return playbackRange(durationInFrames, inFrame, outFrame);
	}

	private reanchor(): void {
		this.anchorTime = now();
		this.anchorFrame = this.snapshot.frame;
	}

	/** Applies new props; a changed playback rate re-anchors and dispatches `ratechange`. */
	setOptions(next: PlaybackOptions): void {
		const prev = this.options;
		if (
			this.snapshot.playing &&
			(prev.fps !== next.fps || prev.playbackRate !== next.playbackRate)
		) {
			this.advanceToNow();
			this.reanchor();
		}
		this.options = next;
		if (next.durationInFrames !== prev.durationInFrames) {
			const last = next.durationInFrames - 1;
			if (this.snapshot.frame > last) this.setFrame(last);
		}
		if (prev.playbackRate !== next.playbackRate) {
			this.emitter.dispatch("ratechange", { playbackRate: next.playbackRate });
		}
	}

	private setFrame(frame: number, patch: Partial<PlaybackSnapshot> = {}): void {
		const changed = frame !== this.snapshot.frame;
		this.update({ ...patch, frame });
		if (changed) this.emitter.dispatch("frameupdate", { frame });
	}

	play(): void {
		if (this.snapshot.playing) return;
		const from = startFrameForPlay(this.snapshot.frame, this.range, this.options.playbackRate);
		this.playStartFrame = from;
		this.setFrame(from, { playing: true, hasPlayed: true, ended: false });
		this.reanchor();
		this.mediaStart.open(now());
		this.lastTimeUpdate = Number.NEGATIVE_INFINITY;
		this.emitter.dispatch("play", undefined);
		this.schedule();
	}

	pause(): void {
		if (!this.snapshot.playing) return;
		this.advanceToNow();
		this.cancel();
		this.mediaStart.close();
		this.update({ playing: false });
		this.emitter.dispatch("pause", undefined);
	}

	toggle(): void {
		if (this.snapshot.playing) this.pause();
		else this.play();
	}

	pauseAndReturnToPlayStart(): void {
		if (!this.snapshot.playing) return;
		this.pause();
		this.seekTo(this.playStartFrame);
	}

	/** Moves to `frame` (rounded and clamped to the composition) and dispatches `seeked`. */
	seekTo(frame: number): void {
		if (typeof frame !== "number" || Number.isNaN(frame)) {
			throw new TypeError(`seekTo() expects a frame number, got ${String(frame)}`);
		}
		const last = this.options.durationInFrames - 1;
		const target = Math.min(last, Math.max(0, Math.round(frame)));
		this.setFrame(target, { ended: false });
		if (this.snapshot.playing) this.reanchor();
		this.emitter.dispatch("seeked", { frame: target });
	}

	/** Marks the seek bar as dragged (hides the paused poster). */
	setScrubbing(scrubbing: boolean): void {
		if (this.snapshot.scrubbing !== scrubbing) this.update({ scrubbing });
	}

	mute(): void {
		if (this.snapshot.muted) return;
		this.update({ muted: true });
		this.emitter.dispatch("mutechange", { isMuted: true });
	}

	unmute(): void {
		if (!this.snapshot.muted) return;
		this.update({ muted: false });
		this.emitter.dispatch("mutechange", { isMuted: false });
	}

	isMuted(): boolean {
		return this.snapshot.muted || this.snapshot.volume === 0;
	}

	getVolume(): number {
		return this.snapshot.muted ? 0 : this.snapshot.volume;
	}

	setVolume(volume: number): void {
		validateVolume("setVolume()", volume);
		if (volume === this.snapshot.volume) return;
		this.update({ volume });
		this.emitter.dispatch("volumechange", { volume });
	}

	private onBufferChange(buffering: boolean): void {
		if (this.snapshot.playing) {
			// Freeze time at the moment buffering starts, and restart the clock when it ends.
			if (buffering) this.advanceToNow();
			this.reanchor();
			// The media elements were paused while buffering and start again with latency.
			if (buffering) this.mediaStart.close();
			else this.mediaStart.open(now());
		}
		this.update({ buffering });
		this.emitter.dispatch(buffering ? "waiting" : "resume", undefined);
	}

	private schedule(): void {
		if (this.rafId !== null || !this.attached) return;
		this.rafId = requestAnimationFrame(this.tick);
	}

	private cancel(): void {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = null;
	}

	private tick = (): void => {
		this.rafId = null;
		if (!this.snapshot.playing || !this.attached) return;
		this.advanceToNow();
		if (this.snapshot.playing) this.schedule();
	};

	/** Moves the frame to where the real clock says it is; handles the end of the range. */
	private advanceToNow(): void {
		if (!this.snapshot.playing) return;
		const t = now();
		if (this.buffer.buffering) {
			this.anchorTime = t;
			this.anchorFrame = this.snapshot.frame;
			return;
		}
		if (this.mediaStart.isOpen) {
			const gate = this.mediaStart.poll(t, this.mediaElements());
			// Held: time does not pass. Released by the media: the clock starts when they did.
			if (gate.hold) {
				this.anchorFrame = this.snapshot.frame;
				this.anchorTime = t;
				return;
			}
			if (gate.startedMsAgo !== null) {
				this.anchorFrame = this.snapshot.frame;
				this.anchorTime = t - gate.startedMsAgo;
			}
		}
		const { fps, playbackRate, loop, moveToBeginningWhenEnded } = this.options;
		const delta = framesElapsed(t - this.anchorTime, fps, playbackRate);
		const range = this.range;
		const result = advance(this.anchorFrame, delta, range, loop);
		if (result.ended) {
			this.cancel();
			this.mediaStart.close();
			this.setFrame(result.frame, { playing: false, ended: true });
			this.emitter.dispatch("pause", undefined);
			this.emitter.dispatch("ended", undefined);
			if (moveToBeginningWhenEnded && this.snapshot.ended) {
				this.setFrame(playbackRate > 0 ? range.start : range.end, { ended: false });
			}
			return;
		}
		if (result.frame === this.snapshot.frame) return;
		this.setFrame(result.frame);
		if (t - this.lastTimeUpdate >= TIME_UPDATE_INTERVAL_MS) {
			this.lastTimeUpdate = t;
			this.emitter.dispatch("timeupdate", { frame: result.frame });
		}
	}

	/** Called when the Player mounts (again, under StrictMode): resumes the loop if playing. */
	attach(): void {
		this.attached = true;
		if (this.snapshot.playing) {
			this.reanchor();
			this.schedule();
		}
	}

	/** Called when the Player unmounts: stops the animation frame loop. */
	detach(): void {
		if (this.snapshot.playing) this.advanceToNow();
		this.attached = false;
		this.cancel();
	}
}
