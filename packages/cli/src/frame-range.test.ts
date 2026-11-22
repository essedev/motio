// The CLI's --frames parser feeds the renderer's resolveFrames: test them together, so a list
// such as the one in --help resolves to the frames it names.

import { describe, expect, it } from "vitest";
import { resolveFrames } from "../../renderer/src/options.js";
import { parseFrameRange } from "./options.js";

const frames = (value: string, duration = 60) => resolveFrames(parseFrameRange(value), 1, duration);

describe("--frames through resolveFrames", () => {
	it("a single frame and a single range", () => {
		expect(frames("5")).toEqual([5]);
		expect(frames("3-5")).toEqual([3, 4, 5]);
		expect(frames("57-")).toEqual([57, 58, 59]);
	});
	it("the --help example 0,30-32,58-", () =>
		expect(frames("0,30-32,58-")).toEqual([0, 30, 31, 32, 58, 59]));
	it("a range then a frame", () => expect(frames("3-5,8")).toEqual([3, 4, 5, 8]));
	it("two frames are two frames, not a range", () => expect(frames("0,5")).toEqual([0, 5]));
	it("a list of frames", () => expect(frames("0,5,9")).toEqual([0, 5, 9]));
});
