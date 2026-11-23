import { EventEmitter } from "node:events";
import type { Browser } from "puppeteer-core";
import { describe, expect, it } from "vitest";
import { BrowserPool, defaultPagesPerBrowser } from "./browser/browser-pool.js";
import { resolvePagesPerBrowser } from "./options.js";

/** A stand-in for a launched browser: `close()` disconnects it, `crash()` too. */
class FakeBrowser extends EventEmitter {
	closed = false;
	connected = true;
	close(): Promise<void> {
		this.closed = true;
		this.crash();
		return Promise.resolve();
	}
	crash(): void {
		if (!this.connected) return;
		this.connected = false;
		this.emit("disconnected");
	}
	process(): null {
		return null;
	}
}

function launcher() {
	const launched: FakeBrowser[] = [];
	const launch = async () => {
		const b = new FakeBrowser();
		launched.push(b);
		return b as unknown as Browser;
	};
	return { launched, launch };
}

describe("defaultPagesPerBrowser", () => {
	it("gives each page its own browser up to concurrency 4, then two pages per browser", () => {
		expect([1, 2, 4, 5, 8, 16].map(defaultPagesPerBrowser)).toEqual([1, 1, 1, 2, 2, 2]);
	});
});

describe("resolvePagesPerBrowser", () => {
	it("accepts positive integers and null, rejects anything else", () => {
		expect(resolvePagesPerBrowser(undefined)).toBeNull();
		expect(resolvePagesPerBrowser(null)).toBeNull();
		expect(resolvePagesPerBrowser(3)).toBe(3);
		for (const bad of [0, -1, 1.5, Number.NaN]) {
			expect(() => resolvePagesPerBrowser(bad)).toThrow(/pagesPerBrowser/);
		}
	});
});

describe("BrowserPool", () => {
	it("packs concurrent leases onto browsers up to pagesPerBrowser", async () => {
		const pool = new BrowserPool();
		const { launched, launch } = launcher();
		const leases = await Promise.all(Array.from({ length: 5 }, () => pool.lease("k", 2, launch)));
		expect(launched).toHaveLength(3);
		expect(leases.map((l) => launched.indexOf(l.browser as unknown as FakeBrowser))).toEqual([
			0, 0, 1, 1, 2,
		]);
		// Only the first page of each browser gets the tab opened at launch.
		expect(leases.map((l) => l.takeInitialTab())).toEqual([true, false, true, false, true]);
		await pool.close();
		expect(launched.every((b) => b.closed)).toBe(true);
	});

	it("reuses a released slot and keeps launch keys apart", async () => {
		const pool = new BrowserPool();
		const { launched, launch } = launcher();
		const a = await pool.lease("k", 1, launch);
		a.release();
		a.release();
		const b = await pool.lease("k", 1, launch);
		expect(b.browser).toBe(a.browser);
		const other = await pool.lease("transparent", 1, launch);
		expect(other.browser).not.toBe(a.browser);
		expect(launched).toHaveLength(2);
		await pool.close();
	});

	it("replaces a browser that crashed or was killed", async () => {
		const pool = new BrowserPool();
		const { launched, launch } = launcher();
		const a = await pool.lease("k", 4, launch);
		(a.browser as unknown as FakeBrowser).crash();
		const b = await pool.lease("k", 4, launch);
		expect(b.browser).not.toBe(a.browser);
		await b.kill();
		const c = await pool.lease("k", 4, launch);
		expect(launched).toHaveLength(3);
		expect(c.browser).toBe(launched[2]);
		expect(pool.size).toBe(1);
		await pool.close();
	});

	it("frees the slot of a failed launch and refuses leases once closed", async () => {
		const pool = new BrowserPool();
		let fail = true;
		const { launched, launch } = launcher();
		const flaky = () => (fail ? Promise.reject(new Error("no chrome")) : launch());
		await expect(pool.lease("k", 2, flaky)).rejects.toThrow("no chrome");
		fail = false;
		await pool.lease("k", 2, flaky);
		expect(launched).toHaveLength(1);
		await pool.close();
		await expect(pool.lease("k", 2, launch)).rejects.toThrow(/closed/);
	});
});
