/** Longest the clock holds after a play request while media elements have not started. */
export const MEDIA_START_TIMEOUT_MS = 1000;

/**
 * Real time an element must have played, and still be advancing, to count as started. Above
 * the preroll Chrome plays before the output device takes the audio (20 to 45 ms of media
 * measured with Bluetooth headphones, after which `currentTime` stalls until output starts).
 */
const STARTED_AFTER_S = 0.06;

/** An element ahead of the slowest one by more than this is moved back at release. */
const ALIGN_TOLERANCE_S = 0.04;

/** HTMLMediaElement's HAVE_FUTURE_DATA: enough data to play forward. */
const HAVE_FUTURE_DATA = 3;

/** The part of a media element the gate reads and, at release, seeks. */
export type MediaClock = Pick<
	HTMLMediaElement,
	"paused" | "ended" | "currentTime" | "readyState" | "playbackRate"
>;

interface Track {
	/** `currentTime` when the gate first saw the element playing. */
	baseline: number;
	/** `currentTime` at the previous poll. */
	last: number;
}

/** What {@link MediaStartGate.poll} tells the clock. */
export type MediaStartResult =
	/** Keep the frame where it is. */
	| { hold: true }
	/**
	 * Run. `startedMsAgo` is how long ago the slowest element started, to backdate the clock to;
	 * null when no element held the clock (nothing plays) or the gate gave up: keep the anchor.
	 */
	| { hold: false; startedMsAgo: number | null };

const RUN_NOW: MediaStartResult = { hold: false, startedMsAgo: null };
const HOLD: MediaStartResult = { hold: true };

/**
 * Holds the Player's clock after a play request until the media elements it plays have really
 * started. A media element's `currentTime` barely moves after `play()` until its output starts:
 * for audio that includes the output device's start-up latency, a few milliseconds on built-in
 * speakers and 200 to 300 ms on Bluetooth headphones. A clock that started at once would run
 * ahead of the sound by that much for the whole playback, below the drift that triggers a
 * re-seek. Holding the frame until every playing element advances starts picture and sound
 * together on any output device. Elements that started sooner (a video without sound) are moved
 * back to the slowest one at release.
 *
 * Paused elements (outside their sequence, past their end, not driven by the Player) are
 * ignored; after {@link MEDIA_START_TIMEOUT_MS} the clock runs regardless, so a stalled element
 * cannot hold the Player.
 */
export class MediaStartGate {
	private openedAt: number | null = null;
	private readonly tracks = new Map<MediaClock, Track>();

	/** Starts holding; called when playback starts or resumes after buffering. */
	open(now: number): void {
		this.openedAt = now;
		this.tracks.clear();
	}

	/** Stops holding, e.g. on pause. */
	close(): void {
		this.openedAt = null;
		this.tracks.clear();
	}

	get isOpen(): boolean {
		return this.openedAt !== null;
	}

	/** Called on every clock tick while playing. */
	poll(now: number, elements: Iterable<MediaClock>): MediaStartResult {
		if (this.openedAt === null) return RUN_NOW;
		if (now - this.openedAt >= MEDIA_START_TIMEOUT_MS) {
			this.close();
			return RUN_NOW;
		}
		let waiting = false;
		const started: Array<{ element: MediaClock; played: number }> = [];
		for (const element of elements) {
			if (element.paused || element.ended) continue;
			const time = element.currentTime;
			const track = this.tracks.get(element);
			if (track === undefined || time < track.baseline) {
				// First sight of this element, or it was seeked back: measure from here.
				this.tracks.set(element, { baseline: time, last: time });
				waiting = true;
				continue;
			}
			const moving = time > track.last;
			track.last = time;
			const played = (time - track.baseline) / rateOf(element);
			if (played >= STARTED_AFTER_S && moving && element.readyState >= HAVE_FUTURE_DATA) {
				started.push({ element, played });
			} else {
				waiting = true;
			}
		}
		if (waiting) return HOLD;
		this.close();
		if (started.length === 0) return RUN_NOW;
		const slowest = Math.min(...started.map((s) => s.played));
		for (const { element, played } of started) {
			const ahead = played - slowest;
			if (ahead > ALIGN_TOLERANCE_S) element.currentTime -= ahead * rateOf(element);
		}
		return { hold: false, startedMsAgo: slowest * 1000 };
	}
}

function rateOf(element: MediaClock): number {
	const rate = element.playbackRate;
	return Number.isFinite(rate) && rate > 0 ? rate : 1;
}
