// lottieFrameAt() gives the frame the published @remotion/lottie seeks lottie-web to, at every
// composition frame of every recorded case (tools/oracle-render/record-lottie.ts), exactly,
// including the inherited <Sequence> props trimBefore, freeze and from.
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/timing.json" with { type: "json" };
import { lottieFrameAt } from "./frame.js";
import type { LottiePlaybackDirection } from "./types.js";

type Case = {
	animation: [number, number, number];
	props: {
		loop?: boolean;
		playbackRate?: number;
		direction?: LottiePlaybackDirection;
		trimBefore?: number;
		freeze?: number;
		from?: number;
	};
	totalFrames: number;
	frames: Array<number | null>;
};

describe("lottieFrameAt matches @remotion/lottie", () => {
	for (const c of oracle.cases as Case[]) {
		it(`animation ${JSON.stringify(c.animation)} with ${JSON.stringify(c.props)}`, () => {
			const { from = 0, trimBefore = 0, freeze } = c.props;
			const timing = {
				loop: c.props.loop ?? false,
				playbackRate: c.props.playbackRate ?? 1,
				direction: c.props.direction,
				trimBefore,
				frozen: freeze !== undefined,
			};
			const ours = c.frames.map((_, frame) => {
				if (frame < from) return null;
				// useCurrentFrame() inside the <Sequence> that <Lottie> wraps itself in.
				const local = freeze ?? frame - from + trimBefore;
				return lottieFrameAt(local, c.totalFrames, timing);
			});
			expect(ours).toEqual(c.frames);
		});
	}

	it("plays forward for any direction but backward", () => {
		const timing = { loop: false, playbackRate: 1 };
		expect(lottieFrameAt(3, 10, { ...timing, direction: undefined })).toBe(3);
		expect(lottieFrameAt(3, 10, { ...timing, direction: "up" as never })).toBe(3);
		expect(lottieFrameAt(3, 10, { ...timing, direction: "backward" })).toBe(6);
	});
});
