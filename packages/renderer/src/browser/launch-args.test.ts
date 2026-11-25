import { describe, expect, it } from "vitest";
import { browserPoolKey } from "../render-page.js";
import { launchArgs } from "./launch.js";

describe("launch arguments", () => {
	const base = { executablePath: "/chrome", width: 1280, height: 720 };

	it("pass the locale as --accept-lang, which dedicated workers read", () => {
		expect(launchArgs({ ...base, locale: "it-IT" })).toContain("--accept-lang=it-IT");
		expect(launchArgs(base).some((a) => a.startsWith("--accept-lang="))).toBe(false);
	});

	it("keep browsers of different locales apart", () => {
		expect(browserPoolKey({ ...base, locale: "it-IT" })).not.toBe(
			browserPoolKey({ ...base, locale: "en-US" }),
		);
	});
});
