import { afterEach, describe, expect, it, vi } from "vitest";
import {
	BEGIN_FRAME_DEPRECATION_CODE,
	type BeginFrameProbe,
	resolveCaptureMethod,
} from "./capture-method.js";

const probeWith = (result: BeginFrameProbe) => vi.fn(async () => result);

describe("resolveCaptureMethod", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("resolves auto to the screenshot path on every platform without probing (D-043)", async () => {
		const probe = probeWith({ supported: true });
		for (const platform of ["linux", "darwin"] as const) {
			expect(await resolveCaptureMethod(undefined, "chrome", {}, platform, probe)).toBe(
				"screenshot",
			);
			expect(await resolveCaptureMethod("auto", "chrome", {}, platform, probe)).toBe("screenshot");
		}
		expect(probe).not.toHaveBeenCalled();
	});

	it("probes for an explicit begin-frame and fails clearly where it is unsupported", async () => {
		expect(
			await resolveCaptureMethod(
				"begin-frame",
				"chrome",
				{},
				"linux",
				probeWith({ supported: true }),
			),
		).toBe("begin-frame");
		await expect(
			resolveCaptureMethod(
				"begin-frame",
				"chrome",
				{},
				"darwin",
				probeWith({ supported: false, reason: "no BeginFrame control" }),
			),
		).rejects.toMatchObject({ code: "E_BEGIN_FRAME_UNSUPPORTED" });
	});

	it("reads $MOTIO_CAPTURE_METHOD when the option is unset and rejects unknown values", async () => {
		vi.stubEnv("MOTIO_CAPTURE_METHOD", "begin-frame");
		const probe = probeWith({ supported: true });
		expect(await resolveCaptureMethod(undefined, "chrome", {}, "linux", probe)).toBe("begin-frame");
		expect(await resolveCaptureMethod("screenshot", "chrome", {}, "linux", probe)).toBe(
			"screenshot",
		);
		vi.stubEnv("MOTIO_CAPTURE_METHOD", "fast");
		await expect(
			resolveCaptureMethod(undefined, "chrome", {}, "linux", probe),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION" });
	});

	it("warns once per process that begin-frame is deprecated, and never for the other methods (D-078)", async () => {
		vi.resetModules();
		const fresh = await import("./capture-method.js");
		const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
		try {
			const probe = probeWith({ supported: true });
			await fresh.resolveCaptureMethod("screenshot", "chrome", {}, "linux", probe);
			await fresh.resolveCaptureMethod("auto", "chrome", {}, "linux", probe);
			expect(emit).not.toHaveBeenCalled();
			await fresh.resolveCaptureMethod("begin-frame", "chrome", {}, "linux", probe);
			await fresh.resolveCaptureMethod("begin-frame", "chrome", {}, "linux", probe);
			expect(emit).toHaveBeenCalledTimes(1);
			expect(emit.mock.calls[0]?.[1]).toMatchObject({
				type: "DeprecationWarning",
				code: BEGIN_FRAME_DEPRECATION_CODE,
			});
		} finally {
			emit.mockRestore();
		}
	});
});
