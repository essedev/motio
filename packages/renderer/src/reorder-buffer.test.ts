import { describe, expect, it } from "vitest";
import { ReorderBuffer } from "./reorder-buffer.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ReorderBuffer", () => {
	it("writes items in order whatever the arrival order", async () => {
		const out: number[] = [];
		const buf = new ReorderBuffer<number>(6, async (i, v) => {
			await tick();
			out.push(i * 10 + v);
		});
		for (const i of [3, 1, 5, 0, 4, 2]) await buf.push(i, i);
		await buf.done();
		expect(out).toEqual([0, 11, 22, 33, 44, 55]);
	});

	it("blocks a push that is too far ahead until the head is written", async () => {
		const buf = new ReorderBuffer<string>(4, async () => {}, 2);
		let pushed3 = false;
		const p3 = buf.push(3, "d").then(() => {
			pushed3 = true;
		});
		await tick();
		expect(pushed3).toBe(false);
		await buf.push(1, "b"); // within the window
		expect(pushed3).toBe(false);
		await buf.push(0, "a"); // head: always accepted, unblocks 3
		await p3;
		expect(pushed3).toBe(true);
		await buf.push(2, "c");
		await buf.done();
		expect(buf.writtenCount).toBe(4);
	});

	it("applies writer backpressure: one write at a time", async () => {
		let active = 0;
		let maxActive = 0;
		const buf = new ReorderBuffer<number>(20, async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await tick();
			active--;
		});
		await Promise.all(Array.from({ length: 20 }, (_, i) => buf.push(19 - i, i)));
		await buf.done();
		expect(maxActive).toBe(1);
	});

	it("rejects pushes and done() after a write fails", async () => {
		const buf = new ReorderBuffer<number>(3, async (i) => {
			if (i === 1) throw new Error("disk full");
		});
		const done = buf.done();
		await buf.push(0, 0);
		await buf.push(1, 1);
		await expect(done).rejects.toThrow("disk full");
		await expect(buf.push(2, 2)).rejects.toThrow("disk full");
	});

	it("abort() wakes blocked producers with the error", async () => {
		const buf = new ReorderBuffer<number>(10, async () => {}, 1);
		const blocked = buf.push(5, 5);
		buf.abort(new Error("cancelled"));
		await expect(blocked).rejects.toThrow("cancelled");
		await expect(buf.done()).rejects.toThrow("cancelled");
	});

	it("rejects duplicates and out-of-range indices", async () => {
		const buf = new ReorderBuffer<number>(2, async () => {});
		await buf.push(1, 1);
		await expect(buf.push(1, 1)).rejects.toThrow("twice");
		await expect(buf.push(2, 0)).rejects.toThrow(RangeError);
	});
});
