import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleFrames } from "./commands/frames.js";
import { framesInRange } from "./frames/render-to-files.js";
import { codecFromOutput, parseConcurrency, parseFrameRange, parseProps } from "./options.js";
import { splitPositionals } from "./project.js";

let cwd: string;
beforeAll(async () => {
	cwd = await mkdtemp(join(tmpdir(), "motio-options-"));
	await writeFile(join(cwd, "props.json"), '{"a":1}');
	await writeFile(join(cwd, "entry.tsx"), "");
});
afterAll(() => rm(cwd, { recursive: true, force: true }));

describe("parseFrameRange", () => {
	it("parses Remotion's forms", () => {
		expect(parseFrameRange("5")).toBe(5);
		expect(parseFrameRange("0-9")).toEqual([0, 9]);
		expect(parseFrameRange("100-")).toEqual([100, null]);
		expect(parseFrameRange("0,30-59,90-")).toEqual([
			[0, 0],
			[30, 59],
			[90, null],
		]);
	});

	it("rejects malformed ranges", () => {
		for (const value of ["", "a", "5-3", "1--2", "-5"]) {
			expect(() => parseFrameRange(value), value).toThrow(
				expect.objectContaining({ code: "E_INVALID_ARGUMENT" }),
			);
		}
	});
});

describe("parseProps", () => {
	it("reads inline JSON or a file", () => {
		expect(parseProps('{"x": [1]}', cwd)).toEqual({ x: [1] });
		expect(parseProps("props.json", cwd)).toEqual({ a: 1 });
	});

	it("rejects non-objects, bad JSON and missing files", () => {
		expect(() => parseProps("[1]", cwd)).toThrow(/does not exist|JSON object/);
		expect(() => parseProps("{nope", cwd)).toThrow(/not valid JSON/);
		expect(() => parseProps("missing.json", cwd)).toThrow(/does not exist/);
	});
});

describe("other options", () => {
	it("parses concurrency", () => {
		expect(parseConcurrency("4")).toBe(4);
		expect(parseConcurrency("50%")).toBe("50%");
		expect(() => parseConcurrency("0")).toThrow();
		expect(() => parseConcurrency("fast")).toThrow();
	});

	it("infers codecs from extensions", () => {
		expect(codecFromOutput("a.MP4")).toBe("h264");
		expect(codecFromOutput("a.webm")).toBe("vp8");
		expect(codecFromOutput("a.xyz")).toBeUndefined();
		expect(codecFromOutput(undefined)).toBeUndefined();
	});

	it("splits positionals like Remotion", () => {
		expect(splitPositionals(["Main"], cwd)).toEqual({
			entry: undefined,
			id: "Main",
			output: undefined,
		});
		expect(splitPositionals(["Main", "out.mp4"], cwd)).toEqual({
			entry: undefined,
			id: "Main",
			output: "out.mp4",
		});
		expect(splitPositionals(["entry.tsx", "Main"], cwd)).toEqual({
			entry: "entry.tsx",
			id: "Main",
			output: undefined,
		});
		expect(splitPositionals(["https://example.com/bundle", "Main"], cwd)).toMatchObject({
			entry: "https://example.com/bundle",
		});
		expect(splitPositionals(["src/x.ts", "Main", "o.mp4"], cwd)).toEqual({
			entry: "src/x.ts",
			id: "Main",
			output: "o.mp4",
		});
		expect(() => splitPositionals(["a", "b", "c", "d"], cwd)).toThrow(/Too many/);
	});

	it("selects frames in ranges and samples them evenly", () => {
		expect(framesInRange(undefined, 4)).toEqual([0, 1, 2, 3]);
		expect(framesInRange([2, null], 5)).toEqual([2, 3, 4]);
		expect(framesInRange([0, [3, 4], [8, null]], 10)).toEqual([0, 3, 4, 8, 9]);
		expect(framesInRange(50, 10)).toEqual([]);
		expect(sampleFrames([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
		expect(sampleFrames([0, 1, 2], 5)).toEqual([0, 1, 2]);
		expect(sampleFrames([4, 5, 6], 1)).toEqual([4]);
	});
});
