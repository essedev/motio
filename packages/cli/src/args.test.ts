import { describe, expect, it } from "vitest";
import { Flags, parseCommandArgs } from "./args.js";

const specs = {
	overwrite: { type: "boolean", description: "" },
	muted: { type: "boolean", description: "" },
	quiet: { type: "boolean", short: "q", description: "" },
	codec: { type: "string", description: "" },
	crf: { type: "string", description: "" },
} as const;

describe("parseCommandArgs", () => {
	it("accepts Remotion's boolean forms", () => {
		const { values } = parseCommandArgs(["--overwrite=false", "--muted=true", "-q"], specs);
		expect(values).toMatchObject({ overwrite: false, muted: true, quiet: true });
		expect(parseCommandArgs(["--no-overwrite"], specs).values.overwrite).toBe(false);
		expect(parseCommandArgs(["--overwrite"], specs).values.overwrite).toBe(true);
	});

	it("keeps positionals and string values", () => {
		const parsed = parseCommandArgs(
			["src/index.ts", "Main", "--codec", "h264", "--crf=18", "out.mp4"],
			specs,
		);
		expect(parsed.positionals).toEqual(["src/index.ts", "Main", "out.mp4"]);
		expect(parsed.values).toMatchObject({ codec: "h264", crf: "18" });
	});

	it("rejects unknown flags and missing values as usage errors", () => {
		expect(() => parseCommandArgs(["--nope"], specs)).toThrow(
			expect.objectContaining({ code: "E_INVALID_ARGUMENT" }),
		);
		expect(() => parseCommandArgs(["--codec"], specs)).toThrow(
			expect.objectContaining({ code: "E_INVALID_ARGUMENT" }),
		);
	});
});

describe("Flags", () => {
	it("validates integers, numbers and enumerations", () => {
		const flags = new Flags({ crf: "18", scale: "0.5", codec: "h264", bad: "1.5" });
		expect(flags.integer("crf", { min: 0 })).toBe(18);
		expect(flags.number("scale", (n) => n > 0, "positive")).toBe(0.5);
		expect(flags.oneOf("codec", ["h264", "vp8"] as const)).toBe("h264");
		expect(flags.integer("missing")).toBeUndefined();
		expect(() => flags.integer("bad")).toThrow(/--bad must be an integer/);
		expect(() => new Flags({ crf: "100" }).integer("crf", { min: 0, max: 51 })).toThrow(
			/from 0 to 51/,
		);
		expect(() => new Flags({ codec: "x" }).oneOf("codec", ["h264"] as const)).toThrow(
			/one of h264/,
		);
	});
});
