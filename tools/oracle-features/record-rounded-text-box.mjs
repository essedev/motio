import { createRoundedTextBox } from "@remotion/rounded-text-box";
import { capture, makeRng, writeFixture } from "./lib.mjs";

const PACKAGE = "@remotion/rounded-text-box";

// Inputs: random blocks of one to six lines (widths and heights from typical caption values,
// with repeats so equal neighbours occur, zero widths and fractional values), every documented
// alignment and an undocumented one, paddings and radii including zero, negatives and radii
// larger than half a line. Hand-picked edge cases follow. Negative line heights are left out: they
// are outside the function's domain (no text has one) and Motio does not reproduce them.
const makeCases = (rng) => {
	const pick = (items) => items[Math.floor(rng() * items.length)];
	const num = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 10) / 10;
	const cases = [];
	for (let i = 0; i < 1000; i++) {
		const count = 1 + Math.floor(rng() * 6);
		const textMeasurements = Array.from({ length: count }, () => ({
			width: pick([0, 50, 100, 100, 100.5, 37.5, num(0, 400), num(0, 400)]),
			height: pick([20, 20, 40, 10, 54, num(1, 80)]),
		}));
		cases.push({
			textMeasurements,
			textAlign: pick(["left", "center", "right", "left", "center", "right", "start"]),
			horizontalPadding: pick([0, 10, 3.5, 20, -2, num(0, 40)]),
			borderRadius: pick([0, 5, 10, 30, 2.5, -1, num(0, 60)]),
		});
	}
	const line = (width, height = 20) => ({ width, height });
	const base = { textAlign: "center", horizontalPadding: 10, borderRadius: 8 };
	cases.push(
		{ ...base, textMeasurements: [] },
		{ ...base, textMeasurements: [line(100)] },
		{ ...base, textMeasurements: [line(100), line(100), line(100)] },
		{ ...base, textMeasurements: [line(100), line(100.0000001)] },
		{ ...base, borderRadius: Number.POSITIVE_INFINITY, textMeasurements: [line(100), line(60)] },
		{ ...base, borderRadius: 1e6, textMeasurements: [line(100, 1e-3)] },
		{ ...base, textMeasurements: [line(-50), line(60)] },
		{ ...base, textAlign: undefined, textMeasurements: [line(100), line(60)] },
		{ ...base, textAlign: "right", textMeasurements: [line(0), line(0)] },
	);
	return cases;
};

export const recordRoundedTextBox = () => {
	const cases = makeCases(makeRng(0x7e47b0)).map((input, index) => {
		const result = capture(() => createRoundedTextBox(input));
		if (result.out) {
			const { d, boundingBox, instructions } = result.out;
			// Instructions are kept for every tenth case: they serialize to `d`.
			result.out = index % 10 === 0 ? { d, boundingBox, instructions } : { d, boundingBox };
		}
		return { input, ...result };
	});
	writeFixture(
		"text",
		PACKAGE,
		"rounded-text-box",
		"createRoundedTextBox() over random multi-line blocks and edge cases: d and boundingBox for every case, instructions for every tenth.",
		cases,
	);
};
