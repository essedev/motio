// A tiny tween engine in the style of GSAP, written for this fixture: one global ticker on
// requestAnimationFrame that advances by the measured time between ticks (with lag smoothing, as
// GSAP's ticker does), and timelines of tweens that write styles straight to elements, outside
// React. Its state accumulates tick after tick, so a frame depends on every tick before it.

type Listener = (time: number) => void;

class Ticker {
	/** Seconds accumulated from the measured deltas. */
	time = 0;
	private last = performance.now();
	private readonly listeners = new Set<Listener>();

	constructor() {
		const tick = (now: number) => {
			let delta = now - this.last;
			this.last = now;
			// Lag smoothing: a long pause counts as one 60 fps tick.
			if (delta > 500) delta = 1000 / 60;
			this.time += delta / 1000;
			for (const listener of this.listeners) listener(this.time);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	add(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

/** Started when the module loads, as GSAP's ticker is. */
export const ticker = new Ticker();

type Props = { x?: number; y?: number; rotate?: number; scale?: number; hue?: number };
interface Tween {
	start: number;
	duration: number;
	from: Required<Props>;
	to: Required<Props>;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A repeating sequence of tweens on one element, started at the ticker's current time. */
export class Timeline {
	private readonly tweens: Tween[] = [];
	private end = 0;
	private state: Required<Props> = { x: 0, y: 0, rotate: 0, scale: 1, hue: 0 };
	private readonly startedAt = ticker.time;
	private readonly stop: () => void;

	constructor(private readonly el: HTMLElement) {
		this.stop = ticker.add((time) => this.render(time - this.startedAt));
	}

	to(props: Props, duration: number): this {
		const from = { ...this.state };
		const to = { ...from, ...props };
		this.tweens.push({ start: this.end, duration, from, to });
		this.end += duration;
		this.state = to;
		return this;
	}

	kill(): void {
		this.stop();
	}

	private render(elapsed: number): void {
		const t = this.end > 0 ? elapsed % this.end : 0;
		const tween =
			this.tweens.find((w) => t >= w.start && t < w.start + w.duration) ?? this.tweens[0];
		if (!tween) return;
		const p = easeInOut(Math.min(1, (t - tween.start) / tween.duration));
		const v = (k: keyof Props) => tween.from[k] + (tween.to[k] - tween.from[k]) * p;
		this.el.style.transform = `translate(${v("x")}px, ${v("y")}px) rotate(${v("rotate")}deg) scale(${v("scale")})`;
		this.el.style.background = `hsl(${v("hue")}deg 80% 55%)`;
	}
}
