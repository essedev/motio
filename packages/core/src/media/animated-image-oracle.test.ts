// Motio's timing rule for <AnimatedImage> against the frames recorded from Remotion 4.0.545
// (fixtures/animated-image/__golden__/remotion/animated-image.json, written by
// tools/oracle-render/record-animated-image.ts). Motio shows the frame whose display interval
// contains the current time and lasts a frame of duration 0 for 100 ms (D-066, D-067); Remotion
// shows the frame whose start is nearest. Every recorded frame must either agree or differ only
// because of those two rules; the counts are in packages/core/COMPAT.md.
// The browser test (packages/player/src/animated-image.integration.test.ts) checks that the
// component draws what these functions say.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type AnimatedImageTimeline,
	animatedImageFrameAt,
	animatedImageTimeAt,
	animatedImageTimeline,
} from "./animated-image-timing.js";

const FIXTURE = join(import.meta.dirname, "../../../../fixtures/animated-image");
const description = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as {
	durationsMs: number[];
};
const oracle = JSON.parse(
	readFileSync(join(FIXTURE, "__golden__/remotion/animated-image.json"), "utf8"),
) as {
	version: string;
	timing: Array<{
		src: string;
		fps: number;
		props: Record<string, unknown>;
		lastFrame: number;
		frames: Array<number | "clear" | null>;
	}>;
};
// The delays of short-delays.gif in hundredths (0, 1, 2, 10), as Chrome's ImageDecoder reports them.
const SHORT_DELAYS_US = [0, 10_000, 20_000, 100_000];

type Shown = number | "clear" | null;

/** Time in the image's timeline at a composition frame, null before `from`. */
function imageTime(fps: number, props: Record<string, unknown>, frame: number): number | null {
	const from = (props.from as number | undefined) ?? 0;
	if (frame < from) return null;
	const rate = (props.playbackRate as number | undefined) ?? 1;
	return animatedImageTimeAt(
		(frame - from) * rate + ((props.trimBefore as number | undefined) ?? 0),
		fps,
	);
}

function motioFrame(timeline: AnimatedImageTimeline, time: number | null, behavior: string): Shown {
	if (time === null) return null;
	return animatedImageFrameAt(timeline, time, behavior) ?? "clear";
}

/**
 * Remotion's rule as identified from the recording: within one play (the time modulo the play
 * for "loop"), the frame whose start is nearest to the time, a tie going to the later frame; a
 * play that stops is over only after its end. Evaluated a microsecond either side too, since a
 * time on a boundary lands on either side in floating point.
 */
function nearestStartFrames(
	timeline: AnimatedImageTimeline,
	time: number,
	behavior: string,
): Shown[] {
	const stops = behavior === "pause-after-finish" || behavior === "clear-after-finish";
	const last = timeline.starts.length - 1;
	return [-1, 0, 1].map((offset) => {
		let t = time + offset;
		if (stops && t > timeline.total) return behavior === "clear-after-finish" ? "clear" : last;
		if (!stops) t = ((t % timeline.total) + timeline.total) % timeline.total;
		let best = 0;
		timeline.starts.forEach((start, i) => {
			if (Math.abs(start - t) <= Math.abs((timeline.starts[best] as number) - t)) best = i;
		});
		return best;
	});
}

describe(`AnimatedImage timing against Remotion ${oracle.version}`, () => {
	const fixture = animatedImageTimeline(description.durationsMs.map((d) => d * 1000));
	const regular = oracle.timing.filter((c) => !c.src.includes("short-delays"));
	const count = fixture.starts.length;

	it("agrees, or differs only by the interval rule, on every recorded frame", () => {
		let frames = 0;
		let agree = 0;
		const byRule: string[] = [];
		const unexplained: string[] = [];
		for (const c of regular) {
			const behavior = (c.props.loopBehavior as string | undefined) ?? "loop";
			c.frames.forEach((recorded, frame) => {
				frames++;
				const time = imageTime(c.fps, c.props, frame);
				const ours = motioFrame(fixture, time, behavior);
				const label = `${c.src} ${JSON.stringify(c.props)} @${c.fps} frame ${frame}: Motio ${ours}, Remotion ${recorded}`;
				if (ours === recorded) agree++;
				else if (
					time !== null &&
					nearestStartFrames(fixture, time, behavior).includes(recorded) &&
					// Never more than one image frame apart (or the last frame where Motio cleared).
					(ours === "clear"
						? recorded === count - 1
						: [1, count - 1].includes((Number(recorded) - Number(ours) + count) % count))
				) {
					byRule.push(label);
				} else {
					unexplained.push(label);
				}
			});
		}
		console.log(
			`AnimatedImage vs Remotion: ${frames} frames over ${regular.length} cases, ${agree} identical, ${byRule.length} one image frame apart by the interval rule`,
		);
		expect(unexplained).toEqual([]);
		expect(frames).toBe(684);
		expect(byRule).toHaveLength(274);
	});

	it("short-delays.gif: Motio shows a 0 delay for 100 ms, Remotion stays on the first frame", () => {
		const c = oracle.timing.find((t) => t.src.includes("short-delays"));
		if (!c) throw new Error("short-delays.gif is not in the recording");
		const timeline = animatedImageTimeline(SHORT_DELAYS_US);
		const ours = c.frames.map((_, frame) =>
			motioFrame(timeline, imageTime(c.fps, c.props, frame), "loop"),
		);
		expect(c.frames.every((f) => f === 0)).toBe(true);
		// 60 fps: frame 0 for 100 ms (frames 0 to 5), then 10 ms, 20 ms and 100 ms, then again.
		expect(ours).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 1]);
		expect(ours.filter((f, i) => f !== c.frames[i])).toHaveLength(9);
	});
});
