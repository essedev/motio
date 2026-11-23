// @vitest-environment jsdom
// The elements each preload function adds, sharing between calls, freeing and the callbacks, in
// a simulated DOM. Loading itself is covered in Chrome by preload.integration.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadAudio, preloadFont, preloadImage, preloadVideo } from "./preload.js";

afterEach(() => {
	document.head.innerHTML = "";
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("preload functions", () => {
	it("buffer media in a hidden element of the body", () => {
		const free = preloadVideo("/clip.mp4");
		const video = document.body.querySelector("video") as HTMLVideoElement;
		expect(video.src).toBe(new URL("/clip.mp4", document.baseURI).href);
		expect(video.preload).toBe("auto");
		expect(video.muted).toBe(true);
		expect(video.style.display).toBe("none");
		free();
		expect(document.body.querySelector("video")).toBeNull();

		preloadAudio("https://example.com/a.mp3");
		expect((document.body.querySelector("audio") as HTMLAudioElement).src).toBe(
			"https://example.com/a.mp3",
		);
	});

	it("preload images and fonts with a link in the head, fonts in CORS mode", () => {
		preloadImage("/photo.png");
		preloadFont("/inter.woff2");
		const [image, font] = [...document.head.querySelectorAll("link")];
		expect(image?.rel).toBe("preload");
		expect(image?.as).toBe("image");
		expect(image?.getAttribute("crossorigin")).toBeNull();
		expect(font?.as).toBe("font");
		expect(font?.getAttribute("crossorigin")).toBe("anonymous");
		expect(font?.href).toBe(new URL("/inter.woff2", document.baseURI).href);
	});

	it("share one element per URL and remove it with the last free", () => {
		const a = preloadVideo("/same.mp4");
		const b = preloadVideo(new URL("/same.mp4", document.baseURI).href);
		const c = preloadAudio("/same.mp4");
		expect(document.body.querySelectorAll("video")).toHaveLength(1);
		expect(document.body.querySelectorAll("audio")).toHaveLength(1);
		a();
		a();
		expect(document.body.querySelectorAll("video")).toHaveLength(1);
		b();
		expect(document.body.querySelectorAll("video")).toHaveLength(0);
		c();
		expect(document.body.children).toHaveLength(0);
	});

	it("call onReady when the asset can be shown, at once if it already can", async () => {
		const first = vi.fn();
		const free = preloadVideo("/ready.mp4", { onReady: first });
		const video = document.body.querySelector("video") as HTMLVideoElement;
		expect(first).not.toHaveBeenCalled();
		video.dispatchEvent(new Event("canplaythrough"));
		expect(first).toHaveBeenCalledTimes(1);
		const second = vi.fn();
		const freeSecond = preloadVideo("/ready.mp4", { onReady: second });
		await flush();
		expect(second).toHaveBeenCalledTimes(1);
		free();
		freeSecond();

		const image = vi.fn();
		preloadImage("/i.png", { onReady: image });
		document.head.querySelector("link")?.dispatchEvent(new Event("load"));
		expect(image).toHaveBeenCalledTimes(1);
	});

	it("report a failure to onError, or as a warning without it", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const onError = vi.fn();
		preloadFont("/missing.woff2", { onError });
		preloadImage("/missing.png");
		for (const link of document.head.querySelectorAll("link")) {
			link.dispatchEvent(new Event("error"));
		}
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
		expect(String(onError.mock.calls[0]?.[0].message)).toMatch(/preloadFont\(\).*missing\.woff2/);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toMatch(/preloadImage\(\).*missing\.png/);
	});

	it("do not call back after being freed", () => {
		const onReady = vi.fn();
		preloadAudio("/x.wav", { onReady })();
		const other = preloadAudio("/y.wav");
		document.body.querySelector("audio")?.dispatchEvent(new Event("canplaythrough"));
		expect(onReady).not.toHaveBeenCalled();
		other();
	});

	it("reject a URL that is not a string", () => {
		expect(() => preloadVideo(42 as never)).toThrow(TypeError);
		expect(() => preloadFont(undefined as never)).toThrow(/preloadFont/);
	});
});
