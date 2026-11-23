// Prop checks of <Lottie>, with the published package's messages and order (recorded in
// __oracle__/lottie.json). `direction` is not checked: anything but "backward" plays forward.

/** Throws when `animationData`, `playbackRate` or `loop` is invalid. */
export function validateLottieProps(props: {
	animationData?: unknown;
	playbackRate?: unknown;
	loop?: unknown;
}): void {
	const { animationData, playbackRate, loop } = props;
	if (typeof animationData !== "object" || animationData === null) {
		throw new Error(
			"animationData should be provided as an object. If you only have the path to the JSON file, load it and pass it as animationData. See https://remotion.dev/docs/lottie/lottie#example for more information.",
		);
	}
	if (playbackRate !== undefined) {
		if (typeof playbackRate !== "number") {
			throw new TypeError(
				`The "playbackRate" prop must be a number or undefined, but is ${JSON.stringify(playbackRate)}`,
			);
		}
		if (!Number.isFinite(playbackRate)) {
			throw new TypeError(`The "playbackRate" props must be a real number, but is ${playbackRate}`);
		}
		if (playbackRate <= 0) {
			throw new TypeError(`The "playbackRate" props must be positive, but is ${playbackRate}`);
		}
	}
	if (loop !== undefined && typeof loop !== "boolean") {
		throw new TypeError(
			`The "loop" prop must be a boolean or undefined, but is "${JSON.stringify(loop)}"`,
		);
	}
}
