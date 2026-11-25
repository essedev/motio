import { describe, expect, it } from "vitest";
import { chromeArgs, resolveRasterMode } from "./browser/flags.js";
import { makeCancelSignal, toAbortController } from "./cancel.js";
import { MotioError } from "./errors.js";
import { shouldRetry } from "./pool.js";
import { fromPageError } from "./render-page.js";

describe("chrome flags", () => {
	it("always includes the determinism flags and software GL by default", () => {
		const args = chromeArgs();
		for (const f of [
			"--font-render-hinting=none",
			"--force-color-profile=srgb",
			"--disable-skia-runtime-opts",
			"--disable-checker-imaging",
			"--use-angle=swiftshader",
		]) {
			expect(args).toContain(f);
		}
	});

	it("draws frames unthrottled with every GL backend", () => {
		expect(chromeArgs()).toContain("--disable-frame-rate-limit");
		expect(chromeArgs({ gl: "angle" })).toContain("--disable-frame-rate-limit");
	});

	it("composites opaque captures in software and rasterises transparent ones on the CPU", () => {
		const gpuFlags = (args: string[]) =>
			args.filter((a) => a === "--disable-gpu-compositing" || a === "--disable-gpu-rasterization");
		expect(gpuFlags(chromeArgs())).toEqual(["--disable-gpu-compositing"]);
		expect(gpuFlags(chromeArgs({ gl: "swiftshader" }))).toEqual(["--disable-gpu-compositing"]);
		expect(gpuFlags(chromeArgs({}, { transparent: true }))).toEqual([
			"--disable-gpu-rasterization",
		]);
		// Hardware GL keeps Chrome's own choice.
		expect(gpuFlags(chromeArgs({ gl: "angle" }, { transparent: true }))).toEqual([]);
		// chromiumOptions.flags can still undo it.
		expect(gpuFlags(chromeArgs({ flags: { "disable-gpu-compositing": false } }))).toEqual([]);
	});

	describe("raster and canvas", () => {
		const graphics = (args: string[]) =>
			args.filter((a) =>
				[
					"--disable-gpu-compositing",
					"--disable-gpu-rasterization",
					"--disable-accelerated-2d-canvas",
				].includes(a),
			);

		it("draws canvases in software where Chrome composites on the GPU", () => {
			// Opaque, CPU raster: software compositing, where both canvas modes draw the same pixels.
			expect(graphics(chromeArgs())).toEqual(["--disable-gpu-compositing"]);
			expect(graphics(chromeArgs({}, { canvas: "gpu" }))).toEqual(["--disable-gpu-compositing"]);
			expect(graphics(chromeArgs({}, { transparent: true }))).toEqual([
				"--disable-gpu-rasterization",
				"--disable-accelerated-2d-canvas",
			]);
			expect(graphics(chromeArgs({}, { transparent: true, canvas: "gpu" }))).toEqual([
				"--disable-gpu-rasterization",
			]);
		});

		it("rasterises on the GPU, compositing on SwiftShader for every capture", () => {
			expect(graphics(chromeArgs({}, { raster: "gpu" }))).toEqual([
				"--disable-accelerated-2d-canvas",
			]);
			expect(graphics(chromeArgs({}, { raster: "gpu", transparent: true, canvas: "gpu" }))).toEqual(
				[],
			);
		});

		it("rasterises on the GPU when the project asks for gl swangle, unless raster says otherwise", () => {
			expect(graphics(chromeArgs({ gl: "swangle" }, { transparent: true }))).toEqual([
				"--disable-accelerated-2d-canvas",
			]);
			expect(graphics(chromeArgs({ gl: "swangle" }, { raster: "cpu", transparent: true }))).toEqual(
				["--disable-gpu-rasterization", "--disable-accelerated-2d-canvas"],
			);
			// Motio's default backend is SwiftShader too, and swiftshader maps to the same flags: only
			// an explicit swangle switches the raster.
			expect(graphics(chromeArgs({ gl: null }, { transparent: true }))).toContain(
				"--disable-gpu-rasterization",
			);
			expect(graphics(chromeArgs({ gl: "swiftshader" }, { transparent: true }))).toContain(
				"--disable-gpu-rasterization",
			);
			expect(resolveRasterMode(undefined, "swangle")).toBe("gpu");
			expect(resolveRasterMode("cpu", "swangle")).toBe("cpu");
			expect(resolveRasterMode(null, undefined)).toBe("cpu");
		});

		it("leaves hardware GL to Chrome unless the render asks", () => {
			expect(graphics(chromeArgs({ gl: "angle" }, { transparent: true }))).toEqual([]);
			expect(graphics(chromeArgs({ gl: "angle" }, { raster: "cpu", canvas: "software" }))).toEqual([
				"--disable-gpu-rasterization",
				"--disable-accelerated-2d-canvas",
			]);
		});

		it("lets chromiumOptions.flags undo the canvas flag", () => {
			const args = chromeArgs(
				{ flags: { "disable-accelerated-2d-canvas": false } },
				{ transparent: true },
			);
			expect(graphics(args)).toEqual(["--disable-gpu-rasterization"]);
		});
	});

	it("maps chromiumOptions to flags", () => {
		const args = chromeArgs({
			gl: "angle",
			ignoreCertificateErrors: true,
			features: { Foo: true, Bar: false },
			flags: { "hide-scrollbars": false, "custom-flag": "x" },
		});
		expect(args).toContain("--use-angle=default");
		expect(args).toContain("--ignore-certificate-errors");
		expect(args).toContain("--enable-features=Foo");
		expect(args).toContain("--disable-features=Bar");
		expect(args).toContain("--custom-flag=x");
		expect(args).not.toContain("--hide-scrollbars");
	});

	it("rejects reserved flags and unknown GL backends", () => {
		expect(() => chromeArgs({ flags: { "user-data-dir": "/tmp" } })).toThrow(/reserved/);
		// @ts-expect-error invalid on purpose
		expect(() => chromeArgs({ gl: "metal" })).toThrow(/chromiumOptions.gl/);
	});
});

describe("cancel signal", () => {
	it("fires callbacks once, including ones registered after cancel", async () => {
		const { cancelSignal, cancel } = makeCancelSignal();
		let calls = 0;
		cancelSignal(() => calls++);
		cancel();
		cancel();
		expect(calls).toBe(1);
		const late = new Promise<void>((r) => cancelSignal(r));
		await late;
	});

	it("aborts an AbortController with E_CANCELLED naming the function", () => {
		const { cancelSignal, cancel } = makeCancelSignal();
		const c = toAbortController(cancelSignal, "renderMedia");
		cancel();
		expect(c.signal.aborted).toBe(true);
		expect(c.signal.reason).toMatchObject({
			code: "E_CANCELLED",
			message: "renderMedia() got cancelled",
		});
	});
});

describe("retry policy", () => {
	const timeout = (retries?: number) => {
		const e = new MotioError("E_READINESS_TIMEOUT", "t") as MotioError & { retries?: number };
		if (retries !== undefined) e.retries = retries;
		return e;
	};

	it("follows the readiness handle's retries, default 0", () => {
		expect(shouldRetry(timeout(), 0, 2)).toBe(false);
		expect(shouldRetry(timeout(2), 1, 2)).toBe(true);
		expect(shouldRetry(timeout(2), 2, 2)).toBe(false);
	});

	it("retries crashes and watchdog timeouts, never user errors", () => {
		expect(shouldRetry(new MotioError("E_BROWSER_CRASHED", "c"), 1, 2)).toBe(true);
		expect(shouldRetry(new MotioError("E_SEEK_TIMEOUT", "c"), 2, 2)).toBe(false);
		expect(shouldRetry(new MotioError("E_RENDER_ERROR", "c"), 0, 2)).toBe(false);
		expect(shouldRetry(new Error("x"), 0, 2)).toBe(false);
	});
});

describe("page errors", () => {
	it("keeps code, label, frame and retries; unknown codes become E_RENDER_ERROR", () => {
		const e = fromPageError(
			{ code: "E_READINESS_TIMEOUT", message: "handle", label: "fetch", frame: 4, retries: 1 },
			undefined,
			"comp",
		);
		expect(e).toMatchObject({
			code: "E_READINESS_TIMEOUT",
			label: "fetch",
			frame: 4,
			composition: "comp",
			retries: 1,
		});
		expect(e.message).toBe("handle (frame 4)");
		expect(
			fromPageError(
				{ code: "E_READINESS_TIMEOUT", message: "stuck while rendering frame 4", frame: 4 },
				undefined,
				undefined,
			).message,
		).toBe("stuck while rendering frame 4");
		expect(e.details).toEqual({
			frame: 4,
			compositionId: "comp",
			label: "fetch",
			option: "timeoutInMilliseconds",
		});
		expect(fromPageError({ message: "boom" }, 7, undefined)).toMatchObject({
			code: "E_RENDER_ERROR",
			frame: 7,
			details: { frame: 7 },
		});
	});

	it("keeps the codes and details of missing assets", () => {
		const e = fromPageError(
			{
				code: "E_ASSET_NOT_FOUND",
				message: "<Img> could not load public/nope.png",
				details: { path: "nope.png", suggestion: "note.png" },
			},
			2,
			"Intro",
		);
		expect(e).toMatchObject({ code: "E_ASSET_NOT_FOUND", frame: 2 });
		expect(e.details).toEqual({
			frame: 2,
			compositionId: "Intro",
			path: "nope.png",
			suggestion: "note.png",
		});
		expect(fromPageError({ code: "E_FONT_LOAD", message: "x" }, 0, undefined).code).toBe(
			"E_FONT_LOAD",
		);
	});
});
