// Prop checks of <Lottie>, in the published package's order (recorded in __oracle__/lottie.json);
// the messages are Motio's own. `direction` is not checked: anything but "backward" plays forward.

const show = (value: unknown) =>
	typeof value === "string" ? JSON.stringify(value) : String(value);

/** Throws when `animationData`, `playbackRate` or `loop` is invalid. */
export function validateLottieProps(props: {
	animationData?: unknown;
	playbackRate?: unknown;
	loop?: unknown;
}): void {
	const { animationData, playbackRate, loop } = props;
	if (typeof animationData !== "object" || animationData === null) {
		throw new Error(
			`<Lottie>: animationData is ${show(animationData)}, not an object. Pass the animation's parsed JSON; with a path or URL, fetch and parse the file first.`,
		);
	}
	if (playbackRate !== undefined) {
		if (typeof playbackRate !== "number") {
			throw new TypeError(
				`<Lottie>: playbackRate is ${show(playbackRate)}: pass a number, or leave it out.`,
			);
		}
		if (!Number.isFinite(playbackRate)) {
			throw new TypeError(`<Lottie>: playbackRate is ${playbackRate}: pass a finite number.`);
		}
		if (playbackRate <= 0) {
			throw new TypeError(`<Lottie>: playbackRate is ${playbackRate}: it must be greater than 0.`);
		}
	}
	if (loop !== undefined && typeof loop !== "boolean") {
		throw new TypeError(`<Lottie>: loop is ${show(loop)}: pass true or false, or leave it out.`);
	}
}
