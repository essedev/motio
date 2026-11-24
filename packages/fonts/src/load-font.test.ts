import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
	open: new Set<number>(),
	next: 1,
	cancelled: [] as unknown[],
}));
vi.mock("@motiojs/core", () => ({
	delayRender: vi.fn(() => {
		const h = core.next++;
		core.open.add(h);
		return h;
	}),
	continueRender: vi.fn((h: number) => core.open.delete(h)),
	cancelRender: vi.fn((err: unknown) => {
		core.cancelled.push(err);
		throw err;
	}),
}));

const { formatFromUrl, loadFont } = await import("./load-font.js");

class FakeFontFace {
	static created: FakeFontFace[] = [];
	constructor(
		readonly family: string,
		readonly source: ArrayBuffer,
		readonly descriptors: FontFaceDescriptors,
	) {
		FakeFontFace.created.push(this);
	}
	async load() {
		return this;
	}
}

describe("formatFromUrl", () => {
	it("maps extensions and ignores query strings and hashes", () => {
		expect(formatFromUrl("/a.woff2")).toBe("woff2");
		expect(formatFromUrl("/a.woff?x=1")).toBe("woff");
		expect(formatFromUrl("https://cdn.test/a.TTF#frag")).toBe("truetype");
		expect(formatFromUrl("/a.otf?v=2#x")).toBe("opentype");
		expect(formatFromUrl("/a.eot")).toBeNull();
		expect(formatFromUrl("/font")).toBeNull();
		expect(formatFromUrl("/dir.woff2/font")).toBeNull();
	});
});

describe("loadFont", () => {
	const added: unknown[] = [];
	const fetchMock = vi.fn(async (url: string) =>
		url.includes("missing")
			? new Response("nope", { status: 404, statusText: "Not Found" })
			: new Response(new Uint8Array([1, 2, 3])),
	);
	beforeEach(() => {
		FakeFontFace.created = [];
		added.length = 0;
		core.open.clear();
		core.cancelled.length = 0;
		fetchMock.mockClear();
		vi.stubGlobal("FontFace", FakeFontFace);
		vi.stubGlobal("document", { fonts: { add: (f: unknown) => added.push(f) } });
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("holds the render until the font is registered, with the given descriptors", async () => {
		const pending = loadFont({
			family: "Inter",
			url: "/inter.woff2",
			weight: 500,
			style: "italic",
			display: "swap",
		});
		expect(core.open.size).toBe(1);
		await expect(pending).resolves.toBeUndefined();
		expect(core.open.size).toBe(0);
		expect(added).toHaveLength(1);
		const face = FakeFontFace.created[0];
		expect(face?.family).toBe("Inter");
		expect(face?.descriptors).toEqual({ weight: "500", style: "italic", display: "swap" });
	});

	it("fetches each URL once", async () => {
		await loadFont({ family: "A", url: "/same.ttf" });
		await loadFont({ family: "B", url: "/same.ttf", weight: "700" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(added).toHaveLength(2);
	});

	it("fails the render with E_FONT_LOAD on a missing file", async () => {
		await expect(loadFont({ family: "M", url: "/missing.woff2" })).rejects.toThrow(
			'loadFont() could not fetch "/missing.woff2": the file does not exist (HTTP 404).',
		);
		expect(core.cancelled[0]).toMatchObject({
			code: "E_FONT_LOAD",
			details: { url: "/missing.woff2", status: 404 },
		});
		expect(core.open.size).toBe(0);
	});

	it("names the file in public/ and the closest file when the bundle lists them", async () => {
		vi.stubGlobal("__motioBundle", {
			staticBase: "/public/",
			staticFiles: [{ name: "fonts/inter-400.woff2" }, { name: "logo.png" }],
		});
		await expect(
			loadFont({ family: "I", url: "/public/fonts/missing-inter-40.woff2" }),
		).rejects.toThrow(
			'loadFont() could not fetch public/fonts/missing-inter-40.woff2: the file does not exist (HTTP 404). Did you mean staticFile("fonts/inter-400.woff2")?',
		);
		expect(core.cancelled[0]).toMatchObject({
			code: "E_FONT_LOAD",
			details: { path: "fonts/missing-inter-40.woff2", suggestion: "fonts/inter-400.woff2" },
		});
	});

	it("fails with E_FONT_LOAD when the browser cannot decode the file", async () => {
		class BrokenFace extends FakeFontFace {
			override async load(): Promise<this> {
				throw new Error("A network error occurred.");
			}
		}
		vi.stubGlobal("FontFace", BrokenFace);
		await expect(loadFont({ family: "B", url: "/broken.woff2" })).rejects.toMatchObject({
			code: "E_FONT_LOAD",
		});
	});

	it("requires a format when the URL has no known extension, before fetching", async () => {
		await expect(loadFont({ family: "N", url: "/font" })).rejects.toThrow(
			'loadFont() cannot tell the font format from the URL "/font": pass format ("woff2", "woff", "opentype" or "truetype").',
		);
		expect(fetchMock).not.toHaveBeenCalled();
		await expect(loadFont({ family: "N", url: "/font", format: "woff2" })).resolves.toBeUndefined();
	});
});
