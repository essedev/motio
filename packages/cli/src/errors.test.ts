import { MotioError } from "@motiojs/compat";
import { describe, expect, it } from "vitest";
import { EXIT, exitCodeFor, formatErrorLines, toErrorJson } from "./errors.js";

/** A renderer error as `@motiojs/renderer` throws it: code, frame, composition and details. */
function rendererError(code: string, message: string, fields: Record<string, unknown>) {
	return Object.assign(new Error(message), { code, ...fields });
}

describe("formatErrorLines", () => {
	it("says where a component threw: frame, composition and the mapped source line", () => {
		const error = rendererError("E_RENDER_ERROR", "Boom at frame ten", {
			frame: 10,
			composition: "Throws",
			details: {
				frame: 10,
				compositionId: "Throws",
				source: { file: "/project/src/lab/Root.tsx", line: 30, column: 9 },
				hint: "Check the props of <Throws>.",
			},
		});
		expect(formatErrorLines(toErrorJson(error), "/project")).toEqual([
			"error [E_RENDER_ERROR]: Boom at frame ten",
			"  at frame 10 of Throws, src/lab/Root.tsx:30:9",
			"  hint: Check the props of <Throws>.",
		]);
	});

	it("prints the message alone when the renderer sets no location", () => {
		const error = new MotioError("E_BUNDLE", "Vite failed.", {});
		expect(formatErrorLines(toErrorJson(error), "/project")).toEqual([
			"error [E_BUNDLE]: Vite failed.",
		]);
	});

	it("keeps a source outside the working directory absolute, and works without a frame", () => {
		const error = rendererError("E_CALCULATE_METADATA", "Bad metadata", {
			details: { compositionId: "Intro", source: { file: "file:///lib/x.ts", line: 4 } },
		});
		expect(formatErrorLines(toErrorJson(error), "/project")[1]).toBe("  in Intro, /lib/x.ts:4");
	});

	it("names the --timeout flag on a delayRender timeout", () => {
		const error = rendererError(
			"E_READINESS_TIMEOUT",
			'delayRender "Waiting for the API" was not cleared after 30000 ms.',
			{
				frame: 0,
				details: { frame: 0, compositionId: "Api", label: "Waiting for the API", timeoutMs: 30000 },
			},
		);
		expect(formatErrorLines(toErrorJson(error), "/project")).toEqual([
			'error [E_READINESS_TIMEOUT]: delayRender "Waiting for the API" was not cleared after 30000 ms.',
			"  at frame 0 of Api",
			"  hint: Raise the limit with --timeout=<ms> (now 30000 ms), or call continueRender() once the work is done.",
		]);
	});

	it("adds no second --timeout hint when the message names the flag", () => {
		const error = rendererError(
			"E_READINESS_TIMEOUT",
			"Raise the timeout (timeoutInMilliseconds in the Node API, --timeout on the command line).",
			{ details: { frame: 2, option: "timeoutInMilliseconds", timeoutMs: 30000 } },
		);
		expect(formatErrorLines(toErrorJson(error), "/project")).toEqual([
			"error [E_READINESS_TIMEOUT]: Raise the timeout (--timeout in the Node API, --timeout on the command line).".replace(
				"(--timeout in the Node API",
				"(timeoutInMilliseconds in the Node API",
			),
			"  at frame 2",
		]);
	});

	it("replaces the renderer option name with the CLI flag", () => {
		const error = rendererError(
			"E_INVALID_OPTION",
			"frameRange start 200 is outside the composition (frames 0 to 149).",
			{ details: { option: "frameRange", value: [200, 300] } },
		);
		expect(formatErrorLines(toErrorJson(error), "/project")[0]).toBe(
			"error [E_INVALID_OPTION]: --frames start 200 is outside the composition (frames 0 to 149).",
		);
	});
});

describe("exitCodeFor", () => {
	it("exits with 2 for every invalid-input code, whoever raised it", () => {
		for (const code of ["E_INVALID_ARGUMENT", "E_INVALID_OPTION", "E_COMPOSITION_NOT_FOUND"]) {
			expect(exitCodeFor(new MotioError(code, "x", {}))).toBe(EXIT.usage);
		}
		expect(exitCodeFor(new MotioError("E_RENDER_ERROR", "x", {}))).toBe(EXIT.error);
		expect(exitCodeFor(new Error("x"))).toBe(EXIT.error);
	});
});
