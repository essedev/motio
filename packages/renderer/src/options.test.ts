import { describe, expect, it } from "vitest";
import {
	assertDimensionsFit,
	defaultConcurrency,
	oneOf,
	resolveConcurrency,
	resolveFrames,
	resolveInputProps,
	resolveJpegQuality,
	resolveTimeModel,
	resolveTimeZoneOption,
	scaledSize,
} from "./options.js";

const code = (c: string) => expect.objectContaining({ code: c });

describe("concurrency", () => {
	it("defaults to half the CPU threads, between 1 and 8", () => {
		expect(defaultConcurrency(1)).toBe(1);
		expect(defaultConcurrency(10)).toBe(5);
		expect(defaultConcurrency(32)).toBe(8);
		expect(resolveConcurrency(null, 10)).toBe(5);
		expect(resolveConcurrency(undefined, 10)).toBe(5);
	});

	it("accepts numbers, numeric strings and percentages", () => {
		expect(resolveConcurrency(3, 10)).toBe(3);
		expect(resolveConcurrency("4", 10)).toBe(4);
		expect(resolveConcurrency("50%", 10)).toBe(5);
		expect(resolveConcurrency("100%", 12)).toBe(12);
		expect(resolveConcurrency("1%", 10)).toBe(1);
	});

	it("rejects invalid values with E_INVALID_OPTION", () => {
		expect(() => resolveConcurrency(0, 10)).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveConcurrency(1.5, 10)).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveConcurrency(11, 10)).toThrow(/exceeds the 10 CPU threads/);
		expect(() => resolveConcurrency("150%", 10)).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveConcurrency("lots", 10)).toThrow(code("E_INVALID_OPTION"));
	});
});

describe("frame selection", () => {
	it("renders every frame by default", () => {
		expect(resolveFrames(null, undefined, 4)).toEqual([0, 1, 2, 3]);
	});

	it("supports a single frame, inclusive and open ranges", () => {
		expect(resolveFrames(2, undefined, 10)).toEqual([2]);
		expect(resolveFrames([3, 5], undefined, 10)).toEqual([3, 4, 5]);
		expect(resolveFrames([7, null], undefined, 10)).toEqual([7, 8, 9]);
	});

	it("concatenates ordered ranges and skips the gaps", () => {
		expect(
			resolveFrames(
				[
					[0, 1],
					[5, 6],
					[8, null],
				],
				undefined,
				10,
			),
		).toEqual([0, 1, 5, 6, 8, 9]);
	});

	it("keeps every nth frame of the selection", () => {
		expect(resolveFrames(null, 3, 10)).toEqual([0, 3, 6, 9]);
		expect(resolveFrames([2, 8], 2, 10)).toEqual([2, 4, 6, 8]);
	});

	it("rejects out-of-range, reversed, overlapping and misplaced open ranges", () => {
		expect(() => resolveFrames(10, undefined, 10)).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveFrames([5, 2], undefined, 10)).toThrow(/ends before it starts/);
		expect(() =>
			resolveFrames(
				[
					[0, 4],
					[4, 6],
				],
				undefined,
				10,
			),
		).toThrow(/not overlap/);
		expect(() =>
			resolveFrames(
				[
					[0, null],
					[5, 6],
				],
				undefined,
				10,
			),
		).toThrow(/only be the last/);
		expect(() => resolveFrames(null, 0, 10)).toThrow(/everyNthFrame/);
	});
});

describe("encoding options", () => {
	it("validates jpegQuality against the image format", () => {
		expect(resolveJpegQuality("jpeg", undefined)).toBe(80);
		expect(resolveJpegQuality("jpeg", 95)).toBe(95);
		expect(() => resolveJpegQuality("png", 90)).toThrow(/only valid with imageFormat "jpeg"/);
		expect(() => resolveJpegQuality("jpeg", 101)).toThrow(code("E_INVALID_OPTION"));
	});

	it("checks enumerations", () => {
		expect(oneOf("x", undefined, ["a", "b"] as const, "a")).toBe("a");
		expect(oneOf("x", "b", ["a", "b"] as const, "a")).toBe("b");
		expect(() => oneOf("x", "c", ["a", "b"] as const, "a")).toThrow(/x must be one of "a", "b"/);
	});

	it("rejects odd sizes for subsampled pixel formats only", () => {
		expect(() => assertDimensionsFit(1280, 720, "yuv420p")).not.toThrow();
		expect(() => assertDimensionsFit(127, 72, "yuv420p")).toThrow(code("E_ODD_DIMENSIONS"));
		expect(() => assertDimensionsFit(128, 71, "yuv420p")).toThrow(code("E_ODD_DIMENSIONS"));
		expect(() => assertDimensionsFit(128, 71, "yuv422p")).not.toThrow();
		expect(() => assertDimensionsFit(127, 71, "yuv444p")).not.toThrow();
	});

	it("scales sizes", () => {
		expect(scaledSize(640, 360, 2)).toEqual({ width: 1280, height: 720 });
		expect(scaledSize(641, 361, 0.5)).toEqual({ width: 321, height: 181 });
	});

	it("requires input props to be a JSON object", () => {
		expect(resolveInputProps(undefined)).toEqual({});
		expect(resolveInputProps({ a: 1, d: new Date(0) })).toEqual({
			a: 1,
			d: "1970-01-01T00:00:00.000Z",
		});
		expect(() => resolveInputProps([1])).toThrow(code("E_INVALID_OPTION"));
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() => resolveInputProps(cyclic)).toThrow(/serialisable/);
	});
});

describe("time model", () => {
	it("takes the option, else the composition's, else the frame model", () => {
		expect(resolveTimeModel(undefined, {})).toBe("frame");
		expect(resolveTimeModel(null, { timeModel: "virtual" })).toBe("virtual");
		expect(resolveTimeModel("frame", { timeModel: "virtual" })).toBe("frame");
		expect(resolveTimeModel("virtual", {})).toBe("virtual");
	});

	it("rejects other values", () => {
		expect(() => resolveTimeModel("real", {})).toThrow(
			expect.objectContaining({ code: "E_INVALID_OPTION" }),
		);
	});
});

describe("time zone", () => {
	it("is UTC unless the option names another IANA zone", () => {
		expect(resolveTimeZoneOption(undefined)).toBe("UTC");
		expect(resolveTimeZoneOption(null)).toBe("UTC");
		expect(resolveTimeZoneOption("Europe/Rome")).toBe("Europe/Rome");
	});

	it("rejects a name that is not a time zone", () => {
		for (const value of ["", "Mars/Base", 2]) {
			expect(() => resolveTimeZoneOption(value)).toThrow(code("E_INVALID_OPTION"));
		}
	});
});
