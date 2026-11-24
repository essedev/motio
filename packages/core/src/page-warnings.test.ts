import { describe, expect, it, vi } from "vitest";
import { PageWarningRegistry } from "./page-warnings.js";

describe("PageWarningRegistry", () => {
	it("records each warning once, drains new ones and notifies listeners", () => {
		const registry = new PageWarningRegistry();
		const listener = vi.fn();
		const unsubscribe = registry.subscribe(listener);
		expect(registry.report({ code: "W_TIMELINE_SHORT", message: "a" })).toBe(true);
		expect(registry.report({ code: "W_TIMELINE_SHORT", message: "a" })).toBe(false);
		expect(registry.report({ code: "W_MATH_RANDOM", message: "b" })).toBe(true);
		expect(listener).toHaveBeenCalledTimes(2);
		expect(registry.take().map((w) => w.message)).toEqual(["a", "b"]);
		expect(registry.take()).toEqual([]);
		expect(registry.list().map((w) => w.message)).toEqual(["a", "b"]);
		unsubscribe();
		registry.report({ code: "W_MATH_RANDOM", message: "c" });
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
