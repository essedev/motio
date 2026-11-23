import { describe, expect, it } from "vitest";
import { codecEncoders, parseEncoderList } from "./doctor.js";

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
