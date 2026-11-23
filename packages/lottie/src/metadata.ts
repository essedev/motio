import type { LottieAnimationData, LottieMetadata } from "./types.js";

/**
 * The dimensions, duration and frame rate of a Lottie animation, read from its JSON. Returns
 * `null` when the width, the height, the frame rate or the duration is missing or zero.
 * `durationInFrames` is rounded down; both durations use the animation's own frame rate.
 */
export function getLottieMetadata(animationData: LottieAnimationData): LottieMetadata | null {
	// Fields are read as they are, unchecked, like the published package (recorded in
	// __oracle__/lottie.json): a string frame rate stays a string. Reading `w` first throws the
	// same TypeError for null or undefined.
	const data = animationData as unknown as Record<string, unknown>;
	const width = data.w as number;
	const height = data.h as number;
	const fps = data.fr as number;
	if (!width || !height || !fps) return null;
	const inPoint = typeof data.ip === "number" ? data.ip : 0;
	const frames = (data.op as number) - inPoint;
	const durationInSeconds = frames / fps;
	if (!durationInSeconds) return null;
	return { durationInFrames: Math.floor(frames), durationInSeconds, fps, height, width };
}
