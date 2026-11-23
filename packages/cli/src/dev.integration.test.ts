// `motio dev` end to end: the real dev server on a copy of the hello fixture, the preview page in
// the pinned chrome-headless-shell, the render check through the real renderer, hot reload, and a
// clean shutdown.
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeImage, type RgbaImage, ssim } from "@motiojs/testing";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testChromeArgs } from "../../testing/src/browser.js";
import { defaultDeps, runCli } from "./main.js";
import { type TestIo, testIo, validator } from "./test-support/fakes.js";

const chrome =
	process.env.MOTIO_BROWSER_EXECUTABLE ??
	resolve(
		process.env.HOME ?? "",
		".cache/motio/browsers/chrome-headless-shell/mac_arm-158.0.8127.36/chrome-headless-shell-mac-arm64/chrome-headless-shell",
	);
const tools = {
	ffmpeg: process.env.MOTIO_FFMPEG ?? "ffmpeg",
	ffprobe: process.env.MOTIO_FFPROBE ?? "ffprobe",
};

const fixture = fileURLToPath(new URL("../test-fixtures/hello/", import.meta.url));
// A copy, so edits for hot reload never touch the fixture. Inside the package so `remotion`
// resolves through packages/cli/node_modules; `.motio/` is ignored by git.
const project = fileURLToPath(
	new URL(`../test-fixtures/.motio/dev-${process.pid}-${Date.now()}/`, import.meta.url),
);
const validate = validator();

let io: TestIo;
let exit: Promise<number>;
let stop: () => void = () => {};
let url: string;
let browser: Browser;
let page: Page;
/** Where the render check wrote its stills; removed on shutdown. */
let stillsDir: string | undefined;

async function until<T>(read: () => Promise<T>, check: (value: T) => boolean, label: string) {
	const deadline = Date.now() + 30_000;
	let value = await read();
	while (!check(value)) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}; last: ${value}`);
		await new Promise((r) => setTimeout(r, 50));
		value = await read();
	}
	return value;
}

const frameValue = () =>
	page.$eval("[data-testid=frame-input]", (e) => (e as HTMLInputElement).value);

/** The Player's canvas at 100%, without its overlaid controls. */
async function capturePlayer(): Promise<RgbaImage> {
	const stage = await page.$("[data-testid=stage]");
	if (!stage) throw new Error("No stage.");
	const png = await stage.screenshot({ type: "png" });
	return decodeImage(png, tools);
}

beforeAll(async () => {
	await mkdir(project, { recursive: true });
	await cp(fixture, project, { recursive: true });
	io = testIo(project);
	io.env = { REMOTION_TAG: "tagged" };
	const deps = {
		...defaultDeps(process.env),
		onInterrupt: (handler: () => void) => {
			stop = handler;
			return () => {
				stop = () => {};
			};
		},
	};
	exit = runCli(["dev", "--json"], io, deps);
	await until(
		async () => io.out.length,
		(n) => n > 0,
		"the dev server",
	);
	const result = JSON.parse(io.out[0] as string);
	expect(validate("dev", result), JSON.stringify(result)).toBeNull();
	expect(result.ok, JSON.stringify(result)).toBe(true);
	url = result.url;

	browser = await puppeteer.launch({
		executablePath: chrome,
		headless: true,
		// The renderer's pixel flags, so text and colours match the render check.
		args: testChromeArgs([
			"--font-render-hinting=none",
			"--disable-lcd-text",
			"--force-color-profile=srgb",
			"--force-device-scale-factor=1",
		]),
	});
	page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
	page.on("pageerror", (error) => console.error("page error:", error));
});

afterAll(async () => {
	await browser?.close();
	stop();
	await exit?.catch(() => undefined);
	await rm(project, { recursive: true, force: true });
});

describe("motio dev", () => {
	it("prints its URL in JSON and serves the preview page", async () => {
		expect(io.out).toHaveLength(1);
		expect(url).toMatch(/^http:\/\/localhost:\d+\/$/);
		await page.goto(url);
		await page.waitForSelector("[data-composition-id=Hello]");
		const ids = await page.$$eval("[data-composition-id]", (items) =>
			items.map((item) => item.getAttribute("data-composition-id")),
		);
		expect(ids).toEqual(["Hello"]);
	});

	it("selects a composition, keeps it in the hash, and shows its metadata", async () => {
		await page.click("[data-composition-id=Hello]");
		expect(await page.evaluate(() => window.location.hash)).toBe("#/Hello");
		await page.waitForSelector("[data-testid=stage]");
		expect(await page.$eval("[data-testid=composition-meta]", (e) => e.textContent)).toBe(
			"320×180 · 30 fps · 30 frames (1.00 s)",
		);
	});

	it("shows the same pixels as a render of the same frame", async () => {
		await page.select("[data-testid=zoom]", "1");
		await page.click("[data-testid=frame-input]");
		await page.keyboard.type("17");
		await page.keyboard.press("Enter");
		await until(frameValue, (v) => v === "17", "frame 17");
		// Step back and forward with the keyboard to land on 17 again.
		await page.keyboard.press("ArrowLeft");
		await until(frameValue, (v) => v === "16", "frame 16");
		await page.keyboard.press("ArrowRight");
		await until(frameValue, (v) => v === "17", "frame 17 again");
		await page.addStyleTag({ content: "[data-motio-controls] { display: none !important; }" });
		await page.mouse.move(0, 0);
		const box = await (await page.$("[data-testid=stage]"))?.boundingBox();
		expect(box).toMatchObject({ width: 320, height: 180 });
		const preview = await capturePlayer();

		await page.click("[data-testid=render-still]");
		await page.waitForSelector("[data-testid=still-image], [data-testid=still-error]", {
			timeout: 60_000,
		});
		const panel = await page.$eval("[data-testid=still-panel]", (e) => e.textContent);
		const still = await page.$("[data-testid=still-image]");
		expect(still, panel ?? "").not.toBeNull();
		stillsDir = panel?.match(/\/\S+\/stills\//)?.[0];
		expect(stillsDir && existsSync(stillsDir)).toBe(true);
		const src = await page.$eval("[data-testid=still-image]", (e) => e.getAttribute("src"));
		expect(await page.$eval("[data-testid=still-image]", (e) => e.getAttribute("data-frame"))).toBe(
			"17",
		);
		const rendered = await decodeImage(
			new Uint8Array(await (await fetch(new URL(src ?? "", url))).arrayBuffer()),
			tools,
		);
		expect([rendered.width, rendered.height]).toEqual([320, 180]);
		// Same browser, same flags: the frames are near identical (0.9999 measured). Page styles
		// leaking into the Player (an inherited line height) scored 0.992, so 0.999 is the bar.
		expect(ssim(preview, rendered)).toBeGreaterThanOrEqual(0.999);
	});

	it("hot reloads a component edit in place, keeping the frame", async () => {
		await page.evaluate(() => {
			(window as unknown as { __sameDocument: boolean }).__sameDocument = true;
		});
		const root = join(project, "src", "Root.tsx");
		const source = await readFile(root, "utf8");
		await writeFile(root, source.replace("rgb(20, 40, 80)", "rgb(200, 40, 80)"));
		const corner = async () => {
			const image = await capturePlayer();
			const at = (image.width * (image.height - 2) + image.width - 2) * 4;
			return [...image.data.subarray(at, at + 3)].join(",");
		};
		await until(corner, (rgb) => rgb === "200,40,80", "the edited background");
		expect(await frameValue()).toBe("17");
		expect(
			await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
		).toBe(true);
	});

	it("reloads the page for an edit outside a component and restores the frame", async () => {
		const entry = join(project, "src", "index.ts");
		await writeFile(entry, `${await readFile(entry, "utf8")}\n// edited\n`);
		await until(
			() =>
				page
					.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)
					.catch(() => true),
			(same) => same !== true,
			"the full reload",
		);
		await page.waitForSelector("[data-testid=stage]");
		expect(await until(frameValue, (v) => v === "17", "the restored frame")).toBe("17");
		expect(await page.evaluate(() => window.location.hash)).toBe("#/Hello");
	});

	it("shuts down cleanly on Ctrl+C", async () => {
		stop();
		expect(await exit).toBe(0);
		expect(io.out).toHaveLength(1);
		await expect(fetch(url)).rejects.toThrow();
		expect(stillsDir && existsSync(stillsDir)).toBe(false);
	});
});
