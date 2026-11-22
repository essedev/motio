/**
 * Prop validation for `<Player>` and `<Thumbnail>`. Invalid props throw during render, so the
 * mistake shows at the call site instead of as a broken playback.
 */

function describe(value: unknown): string {
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "number" || typeof value === "boolean" || value == null) {
		return String(value);
	}
	return typeof value;
}

function fail(component: string, message: string): never {
	throw new TypeError(`<${component}>: ${message}`);
}

function isInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Props both components validate the same way. */
export interface CanvasPropsToValidate {
	component?: unknown;
	lazyComponent?: unknown;
	durationInFrames?: unknown;
	fps?: unknown;
	compositionWidth?: unknown;
	compositionHeight?: unknown;
	inputProps?: unknown;
}

/** Checks the composition source, timing and size props. */
export function validateCanvasProps(component: string, props: CanvasPropsToValidate): void {
	const hasComponent = props.component !== undefined && props.component !== null;
	const hasLazy = props.lazyComponent !== undefined && props.lazyComponent !== null;
	if (hasComponent && hasLazy) {
		fail(component, 'pass either "component" or "lazyComponent", not both.');
	}
	if (!hasComponent && !hasLazy) {
		fail(component, 'pass a "component" or a "lazyComponent" prop.');
	}
	if (hasLazy && typeof props.lazyComponent !== "function") {
		fail(
			component,
			`"lazyComponent" must be a function returning a dynamic import, got ${describe(props.lazyComponent)}.`,
		);
	}
	const { durationInFrames, fps, compositionWidth, compositionHeight } = props;
	if (!isInteger(durationInFrames) || durationInFrames <= 0) {
		fail(
			component,
			`"durationInFrames" must be an integer greater than 0, got ${describe(durationInFrames)}.`,
		);
	}
	if (!isFiniteNumber(fps) || fps <= 0) {
		fail(component, `"fps" must be a number greater than 0, got ${describe(fps)}.`);
	}
	for (const [name, value] of [
		["compositionWidth", compositionWidth],
		["compositionHeight", compositionHeight],
	] as const) {
		if (!isFiniteNumber(value) || value <= 0) {
			fail(component, `"${name}" must be a number greater than 0, got ${describe(value)}.`);
		}
	}
	const { inputProps } = props;
	if (
		inputProps !== undefined &&
		(inputProps === null || typeof inputProps !== "object" || Array.isArray(inputProps))
	) {
		fail(component, `"inputProps" must be an object, got ${describe(inputProps)}.`);
	}
}

/** Checks a frame index against the duration. */
export function validateFrameIndex(
	component: string,
	name: string,
	value: unknown,
	durationInFrames: number,
): void {
	if (!isInteger(value) || value < 0) {
		fail(component, `"${name}" must be an integer of at least 0, got ${describe(value)}.`);
	}
	if (value > durationInFrames - 1) {
		fail(
			component,
			`"${name}" must be at most durationInFrames - 1 (${durationInFrames - 1}), got ${value}.`,
		);
	}
}

/** Checks `inFrame` and `outFrame` against each other and the duration. */
export function validateInOutFrames(
	inFrame: unknown,
	outFrame: unknown,
	durationInFrames: number,
): void {
	const hasIn = inFrame !== undefined && inFrame !== null;
	const hasOut = outFrame !== undefined && outFrame !== null;
	if (hasIn) validateFrameIndex("Player", "inFrame", inFrame, durationInFrames);
	if (hasOut) {
		if (!isInteger(outFrame) || outFrame < 1) {
			fail("Player", `"outFrame" must be an integer of at least 1, got ${describe(outFrame)}.`);
		}
		validateFrameIndex("Player", "outFrame", outFrame, durationInFrames);
	}
	if (hasIn && hasOut && (outFrame as number) <= (inFrame as number)) {
		fail(
			"Player",
			`"outFrame" (${String(outFrame)}) must be greater than "inFrame" (${String(inFrame)}).`,
		);
	}
}

/** Checks a playback rate: between -10 and 10, not 0. */
export function validatePlaybackRate(value: unknown): void {
	if (!isFiniteNumber(value) || value === 0 || value < -10 || value > 10) {
		fail(
			"Player",
			`"playbackRate" must be a number between -10 and 10 and not 0, got ${describe(value)}.`,
		);
	}
}

/** Checks a volume: a number between 0 and 1. */
export function validateVolume(where: string, value: unknown): void {
	if (!isFiniteNumber(value) || value < 0 || value > 1) {
		throw new TypeError(`${where} must be a number between 0 and 1, got ${describe(value)}.`);
	}
}

/** The Player props that need checks beyond the shared ones. */
export interface PlayerPropsToValidate {
	durationInFrames: number;
	initialFrame?: unknown;
	playbackRate?: unknown;
	inFrame?: unknown;
	outFrame?: unknown;
	numberOfSharedAudioTags?: unknown;
	sampleRate?: unknown;
	defaultPremountInSeconds?: unknown;
	bufferStateDelayInMilliseconds?: unknown;
	initialVolume?: unknown;
	volumePersistenceKey?: unknown;
	initiallyShowControls?: unknown;
	hideControlsWhenPointerDoesntMove?: unknown;
	showPlaybackRateControl?: unknown;
	posterFillMode?: unknown;
	browserMediaControlsBehavior?: unknown;
	logLevel?: unknown;
	audioLatencyHint?: unknown;
	preferredEffectBackend?: unknown;
}

function validateEnum(name: string, value: unknown, allowed: readonly string[]): void {
	if (value === undefined) return;
	if (typeof value !== "string" || !allowed.includes(value)) {
		fail(
			"Player",
			`"${name}" must be one of ${allowed.map((a) => `"${a}"`).join(", ")}, got ${describe(value)}.`,
		);
	}
}

function validateBooleanOrDuration(name: string, value: unknown): void {
	if (value === undefined || typeof value === "boolean") return;
	if (!isFiniteNumber(value) || value <= 0) {
		fail(
			"Player",
			`"${name}" must be a boolean or a number of milliseconds greater than 0, got ${describe(value)}.`,
		);
	}
}

const LOG_LEVELS = ["trace", "verbose", "info", "warn", "error"] as const;
const EFFECT_BACKENDS = ["auto", "webgpu", "webgl2", "2d"] as const;

/** Validates every Player-only prop. */
export function validatePlayerProps(props: PlayerPropsToValidate): void {
	const { durationInFrames } = props;
	if (props.initialFrame !== undefined) {
		validateFrameIndex("Player", "initialFrame", props.initialFrame, durationInFrames);
	}
	if (props.playbackRate !== undefined) validatePlaybackRate(props.playbackRate);
	validateInOutFrames(props.inFrame, props.outFrame, durationInFrames);
	const tags = props.numberOfSharedAudioTags;
	if (tags !== undefined && (!isInteger(tags) || tags < 0)) {
		fail(
			"Player",
			`"numberOfSharedAudioTags" must be an integer of at least 0, got ${describe(tags)}.`,
		);
	}
	const rate = props.sampleRate;
	if (rate !== undefined && (!isInteger(rate) || rate <= 0)) {
		fail("Player", `"sampleRate" must be a positive integer, got ${describe(rate)}.`);
	}
	const premount = props.defaultPremountInSeconds;
	if (premount !== undefined && (!isFiniteNumber(premount) || premount < 0)) {
		fail(
			"Player",
			`"defaultPremountInSeconds" must be a finite number of at least 0, got ${describe(premount)}.`,
		);
	}
	const delay = props.bufferStateDelayInMilliseconds;
	if (delay !== undefined && (!isFiniteNumber(delay) || delay < 0)) {
		fail(
			"Player",
			`"bufferStateDelayInMilliseconds" must be a number of at least 0, got ${describe(delay)}.`,
		);
	}
	if (props.initialVolume !== undefined) {
		validateVolume('<Player>: "initialVolume"', props.initialVolume);
	}
	const key = props.volumePersistenceKey;
	if (key !== undefined && (typeof key !== "string" || key.length === 0)) {
		fail("Player", `"volumePersistenceKey" must be a non-empty string, got ${describe(key)}.`);
	}
	validateBooleanOrDuration("initiallyShowControls", props.initiallyShowControls);
	validateBooleanOrDuration(
		"hideControlsWhenPointerDoesntMove",
		props.hideControlsWhenPointerDoesntMove,
	);
	const rates = props.showPlaybackRateControl;
	if (rates !== undefined && typeof rates !== "boolean") {
		if (!Array.isArray(rates) || rates.length === 0) {
			fail(
				"Player",
				`"showPlaybackRateControl" must be a boolean or a non-empty array of rates, got ${describe(rates)}.`,
			);
		}
		for (const r of rates) validatePlaybackRate(r);
	}
	validateEnum("posterFillMode", props.posterFillMode, ["player-size", "composition-size"]);
	const media = props.browserMediaControlsBehavior;
	if (media !== undefined) {
		if (media === null || typeof media !== "object") {
			fail(
				"Player",
				`"browserMediaControlsBehavior" must be an object with a "mode", got ${describe(media)}.`,
			);
		}
		const mode = (media as { mode?: unknown }).mode;
		if (mode === undefined) fail("Player", '"browserMediaControlsBehavior" needs a "mode".');
		validateEnum("browserMediaControlsBehavior.mode", mode, [
			"do-nothing",
			"prevent-media-session",
			"register-media-session",
		]);
	}
	validateEnum("logLevel", props.logLevel, LOG_LEVELS);
	validateEnum("audioLatencyHint", props.audioLatencyHint, ["interactive", "balanced", "playback"]);
	validateEnum("preferredEffectBackend", props.preferredEffectBackend, EFFECT_BACKENDS);
}

/** Throws when a prop that is fixed at mount changed. */
export function assertUnchanged(name: string, initial: unknown, current: unknown): void {
	if (!Object.is(initial, current)) {
		fail(
			"Player",
			`"${name}" cannot change after the Player mounted (was ${describe(initial)}, now ${describe(current)}). Remount the Player with a new key to change it.`,
		);
	}
}
