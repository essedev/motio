import type { SharedAudioPool } from "@motiojs/core/internals";

/** A WAV with 0.1 s of silence, played by the shared tags to unlock them on a user gesture. */
function silentWav(): string {
	const samples = 4410;
	const bytes = new Uint8Array(44 + samples * 2);
	const view = new DataView(bytes.buffer);
	const text = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
	};
	text(0, "RIFF");
	view.setUint32(4, 36 + samples * 2, true);
	text(8, "WAVE");
	text(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, 44100, true);
	view.setUint32(28, 88200, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, samples * 2, true);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return `data:audio/wav;base64,${btoa(binary)}`;
}

let silence: string | null = null;

/**
 * The Player's shared audio tags (`numberOfSharedAudioTags`): `<audio>` elements created at mount
 * and played silently on the first user gesture, so audio mounted later may start without one
 * where browsers require it. `<Html5Audio>` borrows an element instead of creating its own.
 */
export class SharedAudioTags implements SharedAudioPool {
	private readonly elements: HTMLAudioElement[];
	private readonly inUse = new Map<HTMLAudioElement, string>();
	private unlocked = false;

	constructor(count: number) {
		silence ??= silentWav();
		this.elements = Array.from({ length: count }, () => {
			const el = document.createElement("audio");
			el.preload = "auto";
			el.src = silence as string;
			return el;
		});
	}

	get size(): number {
		return this.elements.length;
	}

	/** The elements lent to media components; they are not in the document. */
	lent(): HTMLAudioElement[] {
		return [...this.inUse.keys()];
	}

	acquire(owner: string): HTMLAudioElement {
		const free = this.elements.find((el) => !this.inUse.has(el));
		if (!free) {
			throw new Error(
				`${owner} needs a shared audio tag, but all ${this.elements.length} are in use (${[...this.inUse.values()].join(", ")}). Raise numberOfSharedAudioTags on the <Player>, or set it to 0 to let each audio mount its own element.`,
			);
		}
		this.inUse.set(free, owner);
		return free;
	}

	release(element: HTMLAudioElement): void {
		if (!this.inUse.delete(element)) return;
		element.pause();
		element.muted = false;
		element.volume = 1;
		element.loop = false;
		element.src = silence as string;
	}

	/**
	 * Plays every free element silently, within the user gesture that called `play()`, so the
	 * browser lets them play later. Runs once.
	 */
	unlock(): void {
		if (this.unlocked) return;
		this.unlocked = true;
		for (const el of this.elements) {
			if (this.inUse.has(el)) continue;
			Promise.resolve(el.play())
				.then(() => {
					if (!this.inUse.has(el)) el.pause();
				})
				.catch(() => {
					// No gesture yet: the tags stay locked until the next play() with one.
					this.unlocked = false;
				});
		}
	}
}
