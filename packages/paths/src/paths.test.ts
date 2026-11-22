import { describe, expect, it } from "vitest";
import {
	cutPath,
	evolvePath,
	extendViewBox,
	getBoundingBox,
	getInstructionIndexAtLength,
	getLength,
	getPointAtLength,
	getSubpaths,
	interpolatePath,
	normalizePath,
	parsePath,
	reduceInstructions,
	resetPath,
	reversePath,
	scalePath,
	serializeInstructions,
	translatePath,
	warpPath,
} from "./index.js";

describe("paths (documented examples)", () => {
	it("measures and samples a path", () => {
		expect(getLength("M 0 0 L 100 0")).toBe(100);
		expect(getPointAtLength("M 0 0 L 100 0", 50)).toEqual({ x: 50, y: 0 });
		expect(getPointAtLength("M 0 0 L 100 0", 101)).toBeNull();
		expect(getInstructionIndexAtLength("M 0 0 L 100 0 L 200 0", 105)).toEqual({
			index: 1,
			lengthIntoInstruction: 5,
		});
		expect(() => getLength("remotion")).toThrow("Malformed path data");
	});

	it("parses, normalizes, reduces and serializes", () => {
		expect(parsePath("M 10 10 L 20 20")).toEqual([
			{ type: "M", x: 10, y: 10 },
			{ type: "L", x: 20, y: 20 },
		]);
		expect(normalizePath("M 50 50 l 100 0")).toBe("M 50 50 L 150 50");
		expect(serializeInstructions(reduceInstructions(parsePath("m 10 10 h 100")))).toBe(
			"M 10 10 L 110 10",
		);
	});

	it("transforms paths", () => {
		expect(translatePath("M 50 50 L 150 50", 10, 0)).toBe("M 60 50 L 160 50");
		expect(scalePath("M 0 0 L 100 100", 1, 2)).toBe("M 0 0 L 100 200");
		expect(resetPath("M 10 10 L 20 20")).toBe("M 0 0 L 10 10");
		expect(reversePath("M 0 0 L 100 0")).toBe("M 100 0 L 0 0");
		expect(getSubpaths("M 0 0 L 100 0 M 0 100 L 200 100")).toEqual([
			"M 0 0 L 100 0",
			"M 0 100 L 200 100",
		]);
		expect(extendViewBox("0 0 1000 1000", 2)).toBe("-500 -500 2000 2000");
		expect(getBoundingBox("M 35,50 a 25,25,0,1,1,50,0 a 25,25,0,1,1,-50,0").viewBox).toBe(
			"35 24.999999999999993 50 50.00000000000001",
		);
	});

	it("animates paths", () => {
		expect(cutPath("M 0 0 L 100 0 L 100 100", 50)).toBe("M 0 0 L 50 0");
		expect(evolvePath(0.5, "M 0 0 L 100 0")).toEqual({
			strokeDasharray: "100 100",
			strokeDashoffset: 50,
		});
		expect(interpolatePath(0.5, "M 0 0 L 100 0", "M 100 0 L 0 0")).toBe("M 50 0 L 50 0");
		const warped = warpPath("M 0 0 L 0 100", ({ x, y }) => ({ x: x + Math.sin(y / 4) * 5, y }));
		expect(warped.startsWith("M 0 0 L 0.970365514464549 0.78125 L 1.9038320449619508 1.5625")).toBe(
			true,
		);
	});
});
