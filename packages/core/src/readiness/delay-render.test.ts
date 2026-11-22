import { afterEach, describe, expect, it } from "vitest";
import { RUN_CONTEXT_GLOBAL } from "../protocol.js";
import { cancelRender, continueRender, delayRender } from "./delay-render.js";
import { DEFAULT_READINESS_TIMEOUT_MS, readiness } from "./registry.js";

afterEach(() => {
	readiness.reset();
	delete (globalThis as Record<string, unknown>)[RUN_CONTEXT_GLOBAL];
});

describe("delayRender / continueRender", () => {
	it("opens labelled handles and closes them once", () => {
		const a = delayRender("fetch data");
		const b = delayRender();
		expect(a).not.toBe(b);
		expect(readiness.openHandles().map((h) => h.label)).toEqual(["fetch data", null]);
		continueRender(a);
		continueRender(a);
		expect(readiness.size).toBe(1);
		continueRender(b);
		expect(readiness.size).toBe(0);
	});

	it("ignores unknown handles and rejects non-numbers", () => {
		expect(() => continueRender(12345)).not.toThrow();
		expect(() => continueRender("x" as unknown as number)).toThrow(TypeError);
	});

	it("uses 30 s by default, the run context's timeout, or the option", () => {
		const h1 = delayRender("a");
		expect(readiness.openHandles()[0]?.timeoutMs).toBe(DEFAULT_READINESS_TIMEOUT_MS);
		continueRender(h1);
		(globalThis as Record<string, unknown>)[RUN_CONTEXT_GLOBAL] = { readinessTimeoutMs: 1234 };
		const h2 = delayRender("b");
		expect(readiness.openHandles()[0]?.timeoutMs).toBe(1234);
		continueRender(h2);
		delayRender("c", { timeoutInMilliseconds: 7000, retries: 2 });
		expect(readiness.openHandles()[0]).toMatchObject({ timeoutMs: 7000, retries: 2 });
	});

	it("validates its arguments", () => {
		expect(() => delayRender(5 as unknown as string)).toThrow(/must be a string/);
		expect(() => delayRender("x", { timeoutInMilliseconds: 0 })).toThrow(/positive number/);
		expect(() => delayRender("x", { retries: 1.5 })).toThrow(/non-negative integer/);
	});

	it("reports expiry on real time", () => {
		delayRender("slow", { timeoutInMilliseconds: 10 });
		const opened = readiness.openHandles()[0]?.openedAt ?? 0;
		expect(readiness.expired(opened + 9)).toBeNull();
		expect(readiness.expired(opened + 10)).toMatchObject({ label: "slow", timeoutMs: 10 });
	});

	it("records how long closed handles stayed open", () => {
		const h = delayRender("x");
		continueRender(h);
		const closed = readiness.takeClosed();
		expect(closed).toHaveLength(1);
		expect(closed[0]?.label).toBe("x");
		expect(readiness.takeClosed()).toEqual([]);
	});
});

describe("cancelRender", () => {
	it("throws, records the error and releases every handle", () => {
		delayRender("a");
		delayRender("b");
		const err = new Error("boom");
		expect(() => cancelRender(err)).toThrow(err);
		expect(readiness.cancelled()).toBe(err);
		expect(readiness.size).toBe(0);
	});

	it("wraps strings in an Error", () => {
		expect(() => cancelRender("bad data")).toThrow("bad data");
		expect(readiness.cancelled()).toBeInstanceOf(Error);
	});
});
