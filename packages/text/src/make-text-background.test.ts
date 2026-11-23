import { getBoundingBox, type Instruction } from "@motiojs/paths";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/rounded-text-box.json" with { type: "json" };
import { makeTextBackground, textBackgroundOutline } from "./make-text-background.js";
import { type Dimensions, roundedTextBoxOutline, type TextAlign } from "./rounded-text-box.js";

/** Drops lines that do not move the pen, within a tolerance (the two round differently). */
function withoutDegenerate(outline: Instruction[]): Instruction[] {
	const out: Instruction[] = [];
	let x = 0;
	let y = 0;
	for (const i of outline) {
		if (i.type === "L" && Math.abs(i.x - x) < 1e-9 && Math.abs(i.y - y) < 1e-9) continue;
		if (i.type === "A" && i.rx < 1e-9) continue;
		out.push(i);
		if ("x" in i && "y" in i) {
			x = i.x;
			y = i.y;
		}
	}
	return out;
}

const numbers = (outline: Instruction[]) =>
	outline.flatMap((i) => Object.values(i).filter((v): v is number => typeof v === "number"));

type Input = {
	textMeasurements: Dimensions[];
	textAlign: string;
	horizontalPadding: number;
	borderRadius: number;
};

describe("makeTextBackground()", () => {
	it("is the rounded-text-box preset when vertical padding is 0 and joins are round", () => {
		// Inputs inside makeTextBackground()'s domain: a documented alignment, no negative sizes,
		// and first and last lines at least as wide as their corners (makeTextBackground() also
		// caps a corner at half its line's width; the preset, like the published package, does not).
		const inputs = (oracle.cases as { input: Input }[])
			.map((c) => c.input)
			.filter(
				(i) =>
					["left", "center", "right"].includes(i.textAlign) &&
					i.horizontalPadding >= 0 &&
					i.borderRadius >= 0 &&
					Number.isFinite(i.borderRadius) &&
					i.textMeasurements.length > 0 &&
					[i.textMeasurements[0], i.textMeasurements.at(-1)].every(
						(l) =>
							l !== undefined &&
							l.width + 2 * i.horizontalPadding >= 2 * Math.min(i.borderRadius, l.height / 2),
					),
			);
		expect(inputs.length).toBeGreaterThan(400);
		let worst = 0;
		for (const input of inputs) {
			const options = { ...input, textAlign: input.textAlign as TextAlign };
			const expected = withoutDegenerate(roundedTextBoxOutline(options));
			const shape = textBackgroundOutline({
				lines: input.textMeasurements,
				align: options.textAlign,
				cornerRadius: input.borderRadius,
				paddingX: input.horizontalPadding,
			});
			const got = withoutDegenerate(shape.outline);
			expect(got.map((i) => i.type).join(""), JSON.stringify(input)).toBe(
				expected.map((i) => i.type).join(""),
			);
			const a = numbers(got);
			const b = numbers(expected);
			a.forEach((v, k) => {
				worst = Math.max(worst, Math.abs(v - (b[k] as number)));
			});
		}
		// Same outline (compared before arcs become cubics, where rounding can split a quarter arc
		// in two): the two differ only by the order of a few floating-point operations and by the
		// zero-length lines the preset keeps.
		expect(worst).toBeLessThan(1e-9);
	});

	it("adds the vertical padding to the first and last line", () => {
		const shape = makeTextBackground({
			lines: [
				{ width: 100, height: 20 },
				{ width: 60, height: 20 },
			],
			align: "center",
			paddingX: 10,
			paddingY: 6,
			cornerRadius: 8,
		});
		expect(shape.width).toBe(120);
		expect(shape.height).toBe(52);
		expect(shape.lines).toEqual([
			{ x: 10, y: 6, width: 100, height: 20 },
			{ x: 30, y: 26, width: 60, height: 20 },
		]);
		const box = getBoundingBox(shape.path);
		expect(box.x1).toBeCloseTo(0, 9);
		expect(box.y1).toBeCloseTo(0, 9);
		expect(box.x2).toBeCloseTo(120, 9);
		expect(box.y2).toBeCloseTo(52, 9);
	});

	it("draws concave corners where a line is shorter than its neighbour", () => {
		const { instructions } = makeTextBackground({
			lines: [
				{ width: 100, height: 40 },
				{ width: 40, height: 40 },
			],
			cornerRadius: 10,
		});
		// Right side, left-aligned: convex corner ending at (90, 40), then the concave corner from
		// (50, 40) to (40, 50) whose control points lie towards the inner corner (40, 40).
		const concave = instructions.find((i) => i.type === "C" && i.x === 40 && i.y === 50);
		expect(concave).toBeDefined();
		if (concave?.type !== "C") throw new Error("unreachable");
		expect(concave.cp1y).toBeCloseTo(40, 9);
		expect(concave.cp2x).toBeCloseTo(40, 9);
		expect(instructions.some((i) => i.type === "C" && i.x === 90 && i.y === 40)).toBe(true);
	});

	it("bevels corners with straight cuts and squares them with sharp", () => {
		const lines = [
			{ width: 100, height: 40 },
			{ width: 40, height: 40 },
		];
		const bevel = makeTextBackground({ lines, cornerRadius: 10, join: "bevel" });
		expect(bevel.instructions.some((i) => i.type === "C")).toBe(false);
		expect(bevel.path).toBe(
			"M 10 0 L 90 0 L 100 10 L 100 30 L 90 40 L 50 40 L 40 50 L 40 70 L 30 80 L 10 80 L 0 70 L 0 40 L 0 10 L 10 0 Z",
		);
		const sharp = makeTextBackground({ lines, cornerRadius: 10, join: "sharp" });
		expect(sharp.path).toBe("M 0 0 L 100 0 L 100 40 L 40 40 L 40 80 L 0 80 L 0 40 L 0 0 Z");
	});

	it("never draws a corner wider than its line", () => {
		const { instructions } = makeTextBackground({
			lines: [
				{ width: 100, height: 40 },
				{ width: 0, height: 40 },
			],
			cornerRadius: 30,
			paddingX: 4,
		});
		for (const i of instructions) {
			if (i.type !== "Z") expect(i.x).toBeGreaterThanOrEqual(-1e-9);
		}
	});

	it("returns an empty shape for no lines", () => {
		expect(makeTextBackground({ lines: [] })).toEqual({
			path: "",
			instructions: [],
			width: 0,
			height: 0,
			lines: [],
		});
	});

	it("rejects invalid options with a TypeError", () => {
		const lines = [{ width: 10, height: 10 }];
		expect(() => makeTextBackground({ lines, cornerRadius: -1 })).toThrow(TypeError);
		expect(() => makeTextBackground({ lines, paddingX: Number.NaN })).toThrow(/paddingX/);
		expect(() => makeTextBackground({ lines, paddingY: Number.POSITIVE_INFINITY })).toThrow(
			/paddingY/,
		);
		expect(() => makeTextBackground({ lines: [{ width: -1, height: 10 }] })).toThrow(
			/lines\[0\]\.width/,
		);
		expect(() => makeTextBackground({ lines, align: "justify" as never })).toThrow(/align/);
		expect(() => makeTextBackground({ lines, join: "miter" as never })).toThrow(/join/);
		expect(() => makeTextBackground({ lines: undefined as never })).toThrow(/lines/);
	});
});
