/** The part of a Rive `LinearAnimationInstance` that seeking uses. */
export interface SeekableAnimation {
	time: number;
	advance(seconds: number): boolean;
}

/**
 * Puts the animation at `seconds` from its start, whatever it showed before: back to the start
 * time (setting `time` also resets a ping-pong animation's direction), then one advance, which
 * the runtime clamps, loops or bounces as the animation's loop mode says. The published package
 * advances by the time since the frame it drew last instead; both agree when frames are drawn in
 * order, and this way a frame does not depend on the frames drawn before it (D-061).
 */
export function seekAnimation(animation: SeekableAnimation, start: number, seconds: number): void {
	animation.time = start;
	animation.advance(seconds);
}
