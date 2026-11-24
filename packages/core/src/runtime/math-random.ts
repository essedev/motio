import type { FrameWarning } from "../protocol.js";

/**
 * Counts `Math.random()` calls made while a frame renders and settles. In the frame time model
 * nothing reseeds it, so a composition that calls it draws different pixels on every render and
 * on every page: `check determinism` finds every frame different. The wrapper returns the
 * original values; it only counts.
 */
export class MathRandomWatch {
	private calls = 0;
	private active = false;
	private reported = false;
	private uninstall: (() => void) | null = null;

	/** Wraps `Math.random` on `target` (the page's `Math`). */
	install(target: Math = Math): void {
		if (this.uninstall) return;
		const original = target.random;
		const watch = this;
		const wrapped = function random(): number {
			if (watch.active) watch.calls++;
			return original.call(target);
		};
		target.random = wrapped;
		this.uninstall = () => {
			if (target.random === wrapped) target.random = original;
		};
	}

	/** Restores the original `Math.random`. For tests. */
	restore(): void {
		this.uninstall?.();
		this.uninstall = null;
	}

	/** Starts counting the calls of one frame. */
	begin(): void {
		this.calls = 0;
		this.active = true;
	}

	/** Stops counting; returns the warning for the first frame that called it, once per page. */
	end(frame: number): FrameWarning | null {
		this.active = false;
		if (this.calls === 0 || this.reported) return null;
		this.reported = true;
		return {
			code: "W_MATH_RANDOM",
			message: `Math.random() was called ${this.calls} time${this.calls === 1 ? "" : "s"} while frame ${frame} rendered. It returns new values on every render, so frames differ between renders and pages. Use random(seed) from @motiojs/motio, which returns the same value for the same seed.`,
		};
	}
}
