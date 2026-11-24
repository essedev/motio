import { afterEach, describe, expect, it } from "vitest";
import {
	AssetError,
	describeMissingAsset,
	editDistance,
	isAssetError,
	missingAssetDetails,
	nearestName,
	staticPathOf,
	suggestionText,
} from "./asset-error.js";
import { toPageError } from "./runtime/page-error.js";
import { BUNDLE_GLOBAL } from "./static-file.js";

const g = globalThis as Record<string, unknown>;

afterEach(() => {
	delete g[BUNDLE_GLOBAL];
});

describe("nearestName", () => {
	const names = ["cover.jpg", "fonts/inter-400.woff2", "logo.png", "audio/theme.mp3"];

	it("prefers the same name in another case", () => {
		expect(nearestName("Cover.JPG", names)).toBe("cover.jpg");
	});

	it("finds a name a few edits away and nothing for unrelated names", () => {
		expect(nearestName("logo.pgn", names)).toBe("logo.png");
		expect(nearestName("fonts/inter-40.woff2", names)).toBe("fonts/inter-400.woff2");
		expect(nearestName("nope.png", names)).toBeNull();
	});

	it("caps the distance it computes", () => {
		expect(editDistance("kitten", "sitting")).toBe(3);
		expect(editDistance("a", "abcdef", 2)).toBe(3);
	});
});

describe("describeMissingAsset", () => {
	it("gives the path in public/ and the closest file of the bundle", () => {
		g[BUNDLE_GLOBAL] = {
			staticBase: "/public/",
			staticFiles: [{ name: "images/photo.png" }, { name: "logo.png" }],
		};
		const missing = describeMissingAsset("/public/images/foto.png");
		expect(missing).toEqual({
			url: "/public/images/foto.png",
			display: "public/images/foto.png",
			path: "images/foto.png",
			suggestion: "images/photo.png",
		});
		expect(suggestionText(missing)).toBe(' Did you mean staticFile("images/photo.png")?');
		expect(missingAssetDetails(missing)).toEqual({
			url: "/public/images/foto.png",
			path: "images/foto.png",
			suggestion: "images/photo.png",
		});
	});

	it("decodes encoded segments and leaves other URLs as they are", () => {
		g[BUNDLE_GLOBAL] = { staticBase: "/public/", staticFiles: [] };
		expect(staticPathOf("/public/a%20b.png?x=1")).toBe("a b.png");
		expect(staticPathOf("https://cdn.example.com/a.png")).toBeNull();
		expect(describeMissingAsset("/assets/x.png").display).toBe('"/assets/x.png"');
	});
});

describe("asset errors across the page boundary", () => {
	it("keep their code and details instead of the generic cancellation", () => {
		const err = new AssetError("E_ASSET_NOT_FOUND", "gone", { path: "a.png" });
		expect(isAssetError(err)).toBe(true);
		expect(toPageError("E_CANCELLED", err, { frame: 3 })).toMatchObject({
			code: "E_ASSET_NOT_FOUND",
			message: "gone",
			frame: 3,
			details: { path: "a.png" },
		});
		expect(toPageError("E_READINESS_TIMEOUT", err).code).toBe("E_READINESS_TIMEOUT");
		expect(toPageError("E_CANCELLED", new Error("plain")).code).toBe("E_CANCELLED");
	});
});
