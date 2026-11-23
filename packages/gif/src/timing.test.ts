// gifFrameIndex() picks the frame the published <Gif> draws at every composition frame of every
// recorded case (tools/oracle-render/record-gif.ts): the <Sequence> inside <Gif> scales the frame
// by playbackRate, and the time is that frame over the fps, in milliseconds.
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/gif.json" with { type: "json" };
import { gifFrameIndex } from "./timing.js";

type Case = {
	src: string;
	fps: number;
	props: { playbackRate: number; loopBehavior?: string };
	frames: Array<number | string>;
};
const loads = oracle.loads as Record<string, { delays: number[] }>;

describe("gifFrameIndex matches @remotion/gif", () => {
	for (const c of oracle.timing as Case[]) {
		it(`${c.src} at ${c.fps} fps with ${JSON.stringify(c.props)}`, () => {
			const delays = loads[c.src]?.delays ?? [];
			const ours = c.frames.map((_, frame) => {
				const local = frame * c.props.playbackRate;
				const index = gifFrameIndex((local / c.fps) * 1000, delays, c.props.loopBehavior ?? "loop");
				return index === null ? "unmounted" : index;
			});
			expect(ours).toEqual(c.frames);
		});
	}

	it("shows nothing for a GIF without frames", () => {
		expect(gifFrameIndex(0, [], "loop")).toBeNull();
	});
});
