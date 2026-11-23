// Runs the Player in the pinned chrome-headless-shell on the real clock: playback rate, seeking,
// events, buffering, scale and clicks, in a real page with real layout.
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";

const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);

interface RecordedEvent {
	name: string;
	detail: Record<string, unknown> | null;
	t: number;
}

interface PlayerHandle {
	play(): void;
	pause(): void;
	toggle(): void;
	seekTo(frame: number): void;
	getCurrentFrame(): number;
	isPlaying(): boolean;
	getScale(): number;
	getContainerNode(): HTMLDivElement | null;
}

interface TestApi {
	mount(props?: Record<string, unknown>): Promise<void>;
	unmount(): void;
	player(): PlayerHandle;
	events: RecordedEvent[];
	setBlocked(value: boolean): void;
	stampFrame(): number;
	stamp(): Record<string, string> | null;
	nextFrame(): Promise<void>;
}

declare global {
	interface Window {
		__playerTest: TestApi;
	}
}

let server: Server;
let browser: Browser;
let page: Page;

beforeAll(async () => {
	const out = await build({
		entryPoints: [join(import.meta.dirname, "test-support/page-entry.tsx")],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const js = out.outputFiles[0]?.text ?? "";
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body><script>${js}</script></body></html>`;
	server = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "text/html" }).end(html);
	}).listen(0);
	const port = (server.address() as { port: number }).port;
	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		args: testChromeArgs(["--autoplay-policy=no-user-gesture-required"]),
	});
	page = await browser.newPage();
	await page.setViewport({ width: 1024, height: 768 });
	await page.goto(`http://127.0.0.1:${port}/`);
	await page.waitForSelector("body[data-ready=true]");
});

afterAll(async () => {
	await browser?.close();
	server?.close();
});

beforeEach(async () => {
	await page.evaluate(() => window.__playerTest.unmount());
});

async function mount(props: Record<string, unknown> = {}): Promise<void> {
	await page.evaluate((p) => window.__playerTest.mount(p), props);
}

/** Plays for `ms` of real time, measured in the page, and returns frames and elapsed time. */
async function playFor(ms: number) {
	return page.evaluate(async (duration) => {
		const t = window.__playerTest;
		const player = t.player();
		const startFrame = player.getCurrentFrame();
		const start = performance.now();
		player.play();
		await new Promise((r) => setTimeout(r, duration));
		player.pause();
		const elapsed = performance.now() - start;
		await t.nextFrame();
		return {
			startFrame,
			endFrame: player.getCurrentFrame(),
			shown: t.stampFrame(),
			elapsed,
		};
	}, ms);
}

describe("Player in a real browser", () => {
	it("renders inside the Player environment at the fitted scale", async () => {
		await mount();
		const stamp = await page.evaluate(() => window.__playerTest.stamp());
		expect(stamp?.isPlayer).toBe("true");
		expect(stamp?.frame).toBe("0");
		expect(stamp?.scale).toBe("0.25");
		const box = await page.evaluate(() => {
			const r = window.__playerTest.player().getContainerNode()?.getBoundingClientRect();
			return r ? { width: r.width, height: r.height } : null;
		});
		expect(box).toEqual({ width: 480, height: 270 });
	});

	it("advances frames on the real clock at fps", async () => {
		await mount();
		const r = await playFor(1500);
		const expected = (r.elapsed * 30) / 1000;
		expect(r.endFrame - r.startFrame).toBeGreaterThanOrEqual(Math.floor(expected) - 3);
		expect(r.endFrame - r.startFrame).toBeLessThanOrEqual(Math.ceil(expected) + 1);
		expect(r.shown).toBe(r.endFrame);
	});

	it("advances twice as fast at playbackRate 2, and backwards at -1", async () => {
		await mount({ playbackRate: 2 });
		const fast = await playFor(1000);
		const expectedFast = (fast.elapsed * 60) / 1000;
		expect(fast.endFrame - fast.startFrame).toBeGreaterThanOrEqual(Math.floor(expectedFast) - 4);
		expect(fast.endFrame - fast.startFrame).toBeLessThanOrEqual(Math.ceil(expectedFast) + 1);

		// initialFrame is fixed at mount: unmount before mounting with another one.
		await page.evaluate(() => window.__playerTest.unmount());
		await mount({ playbackRate: -1, initialFrame: 200 });
		const back = await playFor(1000);
		const expectedBack = (back.elapsed * 30) / 1000;
		expect(back.startFrame - back.endFrame).toBeGreaterThanOrEqual(Math.floor(expectedBack) - 3);
		expect(back.startFrame - back.endFrame).toBeLessThanOrEqual(Math.ceil(expectedBack) + 1);
	});

	it("renders the sought frame and dispatches seeked and frameupdate", async () => {
		await mount();
		const result = await page.evaluate(async () => {
			const t = window.__playerTest;
			t.player().seekTo(123);
			await t.nextFrame();
			return {
				shown: t.stampFrame(),
				text: document.querySelector("[data-stamp]")?.textContent,
				events: t.events.map((e) => [e.name, e.detail]),
			};
		});
		expect(result.shown).toBe(123);
		expect(result.text).toBe("123");
		expect(result.events).toEqual([
			["frameupdate", { frame: 123 }],
			["seeked", { frame: 123 }],
		]);
	});

	it("dispatches play, timeupdate, pause and ended through a full playback", async () => {
		await mount({ durationInFrames: 30 });
		const names = await page.evaluate(async () => {
			const t = window.__playerTest;
			t.player().play();
			await new Promise((r) => setTimeout(r, 1400));
			return {
				names: t.events.map((e) => e.name).filter((n) => n !== "frameupdate"),
				frameUpdates: t.events.filter((e) => e.name === "frameupdate").length,
				playing: t.player().isPlaying(),
				frame: t.player().getCurrentFrame(),
			};
		});
		expect(names.names[0]).toBe("play");
		expect(names.names.slice(-2)).toEqual(["pause", "ended"]);
		const timeUpdates = names.names.filter((n) => n === "timeupdate").length;
		expect(timeUpdates).toBeGreaterThanOrEqual(3);
		expect(timeUpdates).toBeLessThanOrEqual(5);
		// 29 forward updates plus the move back to the beginning.
		expect(names.frameUpdates).toBe(30);
		expect(names.playing).toBe(false);
		expect(names.frame).toBe(0);
	});

	it("holds the frame while a component buffers and resumes after", async () => {
		await mount();
		const r = await page.evaluate(async () => {
			const t = window.__playerTest;
			const player = t.player();
			player.play();
			await new Promise((res) => setTimeout(res, 300));
			t.setBlocked(true);
			await t.nextFrame();
			const atBlock = player.getCurrentFrame();
			await new Promise((res) => setTimeout(res, 600));
			const afterBlock = player.getCurrentFrame();
			const stillPlaying = player.isPlaying();
			t.setBlocked(false);
			await new Promise((res) => setTimeout(res, 400));
			const resumed = player.getCurrentFrame();
			player.pause();
			return {
				atBlock,
				afterBlock,
				resumed,
				stillPlaying,
				names: t.events.map((e) => e.name).filter((n) => n === "waiting" || n === "resume"),
			};
		});
		expect(r.names).toEqual(["waiting", "resume"]);
		expect(r.stillPlaying).toBe(true);
		expect(r.afterBlock).toBe(r.atBlock);
		expect(r.resumed - r.afterBlock).toBeGreaterThanOrEqual(9);
		expect(r.resumed - r.afterBlock).toBeLessThanOrEqual(14);
	});

	it("follows the container size with ResizeObserver and dispatches scalechange", async () => {
		await mount({ style: { width: "100%" } });
		const r = await page.evaluate(async () => {
			const t = window.__playerTest;
			const before = t.player().getScale();
			const host = document.getElementById("host") as HTMLElement;
			host.style.width = "384px";
			await t.nextFrame();
			await t.nextFrame();
			return {
				before,
				after: t.player().getScale(),
				stampScale: t.stamp()?.scale,
				events: t.events.filter((e) => e.name === "scalechange").map((e) => e.detail),
			};
		});
		expect(r.before).toBeCloseTo(1024 / 1920, 5);
		expect(r.after).toBeCloseTo(0.2, 5);
		expect(r.stampScale).toBe("0.2");
		expect(r.events).toEqual([{ scale: 0.2 }]);
		await page.evaluate(() => {
			(document.getElementById("host") as HTMLElement).style.width = "";
		});
	});

	it("plays and pauses on a real click with controls", async () => {
		await mount({ controls: true });
		const box = await page.evaluate(() => {
			const r = window.__playerTest.player().getContainerNode()?.getBoundingClientRect();
			return r ? { x: r.x + r.width / 2, y: r.y + r.height / 3 } : null;
		});
		if (!box) throw new Error("no container");
		await page.mouse.click(box.x, box.y);
		expect(await page.evaluate(() => window.__playerTest.player().isPlaying())).toBe(true);
		await page.mouse.click(box.x, box.y);
		expect(await page.evaluate(() => window.__playerTest.player().isPlaying())).toBe(false);
		await page.keyboard.press("Space");
		expect(await page.evaluate(() => window.__playerTest.player().isPlaying())).toBe(true);
		await page.evaluate(() => window.__playerTest.player().pause());
	});

	it("seeks with the seek bar by dragging", async () => {
		await mount({ controls: true, alwaysShowControls: true });
		const bar = await page.evaluate(() => {
			const el = document.querySelector("[aria-label=Seek]")?.getBoundingClientRect();
			return el ? { x: el.x, y: el.y + el.height / 2, width: el.width } : null;
		});
		if (!bar) throw new Error("no seek bar");
		await page.mouse.move(bar.x + bar.width / 4, bar.y);
		await page.mouse.down();
		await page.mouse.move(bar.x + bar.width / 2, bar.y, { steps: 4 });
		await page.mouse.up();
		const r = await page.evaluate(async () => {
			await window.__playerTest.nextFrame();
			return {
				frame: window.__playerTest.player().getCurrentFrame(),
				shown: window.__playerTest.stampFrame(),
				seeked: window.__playerTest.events.filter((e) => e.name === "seeked").length,
			};
		});
		expect(Math.abs(r.frame - 150)).toBeLessThanOrEqual(1);
		expect(r.shown).toBe(r.frame);
		expect(r.seeked).toBeGreaterThanOrEqual(2);
	});
});
