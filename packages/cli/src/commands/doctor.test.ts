import { describe, expect, it } from "vitest";
import { codecEncoders, compatibilityCheck, parseEncoderList } from "./doctor.js";

describe("doctor encoders", () => {
	it("reports the encoder each codec would use, or null, skipping container variants", () => {
		const table = {
			h264: ["libx264"],
			"h264-mkv": ["libx264"],
			av1: ["libsvtav1", "libaom-av1"],
			h265: ["libx265"],
		};
		expect(codecEncoders(new Set(["libx264", "libaom-av1"]), table)).toEqual({
			h264: "libx264",
			av1: "libaom-av1",
			h265: null,
		});
	});

	it("parses only the names after the separator line", () => {
		const text =
			"Encoders:\n V..... = Video\n ------\n V....D libsvtav1   SVT-AV1\n A....D aac   AAC\n";
		expect(parseEncoderList(text)).toEqual(new Set(["libsvtav1", "aac"]));
	});
});

describe("doctor compatibility check", () => {
	const summary = {
		supported: 5,
		approximated: 0,
		stubbed: 0,
		missing: 0,
		"unknown-symbol": 0,
		"unsupported-package": 0,
		"unknown-package": 0,
		"not-planned": 0,
		opaque: 0,
	};
	const entry = {
		specifier: "remotion",
		symbol: "Internals",
		isType: false,
		status: "not-planned" as const,
		tier: 1 as const,
		target: null,
		note: null,
		members: [],
		locations: [],
	};
	const report = (overrides: Partial<typeof summary>) => ({
		target: "remotion@4.0.545",
		filesScanned: 3,
		entries: [entry, entry],
		summary: { ...summary, ...overrides },
		parseErrors: [],
		ok: true,
	});

	it("warns, without failing, for symbols Motio does not support by design", () => {
		expect(compatibilityCheck(report({ "not-planned": 2 }))).toMatchObject({
			status: "warn",
			message: expect.stringContaining("except 2 that Motio does not support by design"),
		});
	});

	it("still fails for a missing symbol", () => {
		expect(compatibilityCheck(report({ "not-planned": 2, missing: 1 }))).toMatchObject({
			status: "fail",
		});
	});
});
