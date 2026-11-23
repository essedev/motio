import { describe, expect, it } from "vitest";
import { compareFailure, errorClassOf, failureOf } from "./oracle-errors.js";

describe("errorClassOf", () => {
	it("reports the built-in base class", () => {
		class Custom extends TypeError {}
		expect(errorClassOf(new Custom("x"))).toBe("TypeError");
		expect(errorClassOf(new RangeError("x"))).toBe("RangeError");
		expect(errorClassOf(new Error("x"))).toBe("Error");
		expect(errorClassOf("x")).toBeUndefined();
	});
});

describe("compareFailure", () => {
	const recorded = { error: "inputRange must have at least 1 element", errorType: "Error" };

	it("accepts the same class with a message of its own naming the same option", () => {
		expect(
			compareFailure(new Error("inputRange is empty: pass one value"), recorded, ["inputRange"]),
		).toBeUndefined();
	});

	it("rejects another class, an empty message, the recorded wording and a missing option", () => {
		expect(compareFailure(new TypeError("inputRange is empty"), recorded)).toMatch(/TypeError/);
		expect(compareFailure(new Error(" "), recorded)).toMatch(/empty/);
		expect(compareFailure(new Error(recorded.error), recorded)).toMatch(/recorded wording/);
		expect(compareFailure(new Error("the range is empty"), recorded, ["inputRange"])).toMatch(
			/inputRange/,
		);
	});

	it("allows the engine's own messages to be identical", () => {
		const engine = {
			error: "Cannot read properties of null (reading 'length')",
			errorType: "TypeError",
		};
		expect(compareFailure(new TypeError(engine.error), engine)).toBeUndefined();
	});

	it("matches names as whole words", () => {
		const input = { error: "input can not be undefined" };
		expect(compareFailure(new Error("inputRange is wrong"), input, ["input"])).toMatch(/input/);
	});
});

describe("failureOf", () => {
	it("captures what a call throws", () => {
		expect(failureOf(() => 1)).toEqual({ threw: false, error: undefined });
		const error = new Error("x");
		expect(
			failureOf(() => {
				throw error;
			}).error,
		).toBe(error);
	});
});
