import { describe, expect, it } from "vitest";
import { contentTypeFor, parseRange } from "./static-server.js";

describe("parseRange", () => {
	it.each([
		[undefined, 10, null],
		["bytes=0-4", 10, { start: 0, end: 4 }],
		["bytes=5-", 10, { start: 5, end: 9 }],
		["bytes=-3", 10, { start: 7, end: 9 }],
		["bytes=-30", 10, { start: 0, end: 9 }],
		["bytes=8-20", 10, { start: 8, end: 9 }],
		["bytes=10-", 10, "unsatisfiable"],
		["bytes=5-2", 10, "unsatisfiable"],
		["bytes=-0", 10, "unsatisfiable"],
		["bytes=0-1,4-5", 10, null],
		["items=0-1", 10, null],
	])("%s of %i bytes", (header, size, expected) => {
		expect(parseRange(header, size)).toEqual(expected);
	});
});

describe("contentTypeFor", () => {
	it("maps media and font types, defaulting to octet-stream", () => {
		expect(contentTypeFor("clip.MP4")).toBe("video/mp4");
		expect(contentTypeFor("a/b.woff2")).toBe("font/woff2");
		expect(contentTypeFor("data.bin")).toBe("application/octet-stream");
	});
});
