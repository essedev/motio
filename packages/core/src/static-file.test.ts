import { afterEach, describe, expect, it } from "vitest";
import { RUN_CONTEXT_GLOBAL } from "./protocol.js";
import {
	getStaticFiles,
	STATIC_BASE_GLOBAL,
	STATIC_FILES_GLOBAL,
	staticFile,
} from "./static-file.js";

const g = globalThis as Record<string, unknown>;

afterEach(() => {
	delete g[STATIC_BASE_GLOBAL];
	delete g[STATIC_FILES_GLOBAL];
	delete g[RUN_CONTEXT_GLOBAL];
});

describe("staticFile", () => {
	it("prefixes the public base and encodes each segment", () => {
		expect(staticFile("photo.png")).toBe("/photo.png");
		expect(staticFile("/my-image#portrait.png")).toBe("/my-image%23portrait.png");
		expect(staticFile("assets/a b?.json")).toBe("/assets/a%20b%3F.json");
	});

	it("uses the base the bundler sets", () => {
		g[STATIC_BASE_GLOBAL] = "/static-abc";
		expect(staticFile("x.png")).toBe("/static-abc/x.png");
		g[STATIC_BASE_GLOBAL] = "./";
		expect(staticFile("x.png")).toBe("./x.png");
	});

	it.each([
		["./x.png", /relative paths/],
		["../x.png", /relative paths/],
		["https://example.com/x.png", /not a URL/],
		["/Users/me/project/public/x.png", /absolute file system path/],
		["C:\\project\\x.png", /absolute file system path/],
	])("rejects %s", (input, message) => {
		expect(() => staticFile(input)).toThrow(message);
	});
});

describe("getStaticFiles", () => {
	it("returns an empty array outside rendering", () => {
		g[STATIC_FILES_GLOBAL] = [{ name: "a.png", src: "", sizeInBytes: 1, lastModified: 0 }];
		expect(getStaticFiles()).toEqual([]);
	});

	it("returns the bundler's list with resolved sources when rendering", () => {
		g[RUN_CONTEXT_GLOBAL] = { isRendering: true };
		g[STATIC_FILES_GLOBAL] = [
			{ name: "assets/data.json", src: "", sizeInBytes: 12, lastModified: 5 },
		];
		expect(getStaticFiles()).toEqual([
			{ name: "assets/data.json", src: "/assets/data.json", sizeInBytes: 12, lastModified: 5 },
		]);
	});
});
