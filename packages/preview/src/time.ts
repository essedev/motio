/** Clamps a frame to `[0, durationInFrames - 1]`, rounding to an integer. */
export function clampFrame(frame: number, durationInFrames: number): number {
	if (!Number.isFinite(frame)) return 0;
	return Math.min(Math.max(0, Math.round(frame)), Math.max(0, durationInFrames - 1));
}

const pad = (value: number, length: number) => String(value).padStart(length, "0");

/**
 * Formats a frame as `HH:MM:SS.FF`, where `FF` counts frames inside the second. With a
 * fractional frame rate (29.97) a second starts at the first frame whose time reaches it, so
 * `FF` never exceeds the frames that second holds.
 */
export function formatTimecode(frame: number, fps: number): string {
	const seconds = Math.floor((frame + 1e-9) / fps);
	const firstFrameOfSecond = Math.ceil(seconds * fps - 1e-9);
	const frames = frame - firstFrameOfSecond;
	const digits = String(Math.max(1, Math.ceil(fps) - 1)).length;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(frames, Math.max(2, digits))}`;
}

/** Formats a duration in frames as seconds with two decimals, e.g. `10.00 s`. */
export function formatDuration(durationInFrames: number, fps: number): string {
	return `${(durationInFrames / fps).toFixed(2)} s`;
}

/** Formats a frame rate without trailing zeros: `30`, `29.97`. */
export function formatFps(fps: number): string {
	return String(Number(fps.toFixed(3)));
}
