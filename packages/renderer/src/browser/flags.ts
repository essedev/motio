import { MotioError } from "../errors.js";

/** OpenGL backend, as Remotion's `chromiumOptions.gl`. */
export type OpenGlRenderer = "angle" | "egl" | "swiftshader" | "swangle" | "vulkan" | "angle-egl";

/** Browser options, mirroring Remotion's documented `chromiumOptions`. */
export interface ChromiumOptions {
	/** OpenGL backend. Motio defaults to `swangle` (software, identical pixels across runs). */
	gl?: OpenGlRenderer | null;
	/** Accept self-signed or invalid TLS certificates. Default false. */
	ignoreCertificateErrors?: boolean;
	/** Disable CORS and other web security checks. Default false. */
	disableWebSecurity?: boolean;
	/** Run headless. Default true; `chrome-headless-shell` is always headless. */
	headless?: boolean;
	/** User agent for every page. */
	userAgent?: string | null;
	/** Emulate `prefers-color-scheme: dark`. Default false. */
	darkMode?: boolean;
	/** Accepted for compatibility; Motio always runs Chrome with multiple processes. */
	enableMultiProcessOnLinux?: boolean;
	/** Extra Chrome flags without the leading `--`: `true` adds, a string sets, `false` removes. */
	flags?: Record<string, boolean | string>;
	/** Chrome features to enable (`true`) or disable (`false`). */
	features?: Record<string, boolean>;
	/** Blink features to enable (`true`) or disable (`false`). */
	blinkFeatures?: Record<string, boolean>;
}

/** Flags that make Chrome draw identical pixels on every run (ARCHITECTURE, "Capture"). */
export const DETERMINISM_FLAGS: readonly string[] = [
	"--font-render-hinting=none",
	"--disable-lcd-text",
	"--force-color-profile=srgb",
	"--force-device-scale-factor=1",
	"--disable-skia-runtime-opts",
	"--disable-checker-imaging",
	"--disable-background-timer-throttling",
	"--disable-backgrounding-occluded-windows",
	"--disable-renderer-backgrounding",
	"--disable-ipc-flooding-protection",
	"--hide-scrollbars",
	"--mute-audio",
	"--no-first-run",
	"--no-default-browser-check",
	"--disable-extensions",
	"--disable-component-update",
	"--disable-sync",
	// Chrome draws at most one frame per display refresh (60 Hz), and a screenshot waits for the
	// next frames: about 49 ms per capture on one page. Unthrottled, a frame is drawn as soon as
	// the capture asks for it (D-041).
	"--disable-frame-rate-limit",
];

/**
 * How Chrome rasterises the page: on the CPU (`cpu`, the default) or on the GPU (`gpu`, which with
 * software GL means SwiftShader). Remotion's pixels depend on its `gl` option: its default (Chrome
 * decides) gives the CPU raster's pixels, `gl: "swangle"` (its Lambda and Cloud Run default) the
 * GPU raster's.
 */
export type RasterMode = "cpu" | "gpu";

/**
 * How Chrome draws a 2D `<canvas>`: in software (`software`, the default) or GPU-accelerated
 * (`gpu`), as Remotion's renders do. Software is deterministic under load and far faster on
 * heavy canvases with software GL; the GPU canvas gives Remotion's canvas pixels.
 */
export type CanvasMode = "software" | "gpu";

/** Values of `raster`. */
export const RASTER_MODES: readonly RasterMode[] = ["cpu", "gpu"];

/** Values of `canvas`. */
export const CANVAS_MODES: readonly CanvasMode[] = ["software", "gpu"];

/**
 * The raster mode a render uses: the explicit option, else `gpu` when the project asked for
 * `gl: "swangle"` itself (so it gets the pixels Remotion gives with that setting), else `cpu`.
 * Motio's default backend is SwiftShader too, but only an explicit `swangle` switches the raster.
 */
export function resolveRasterMode(
	raster: RasterMode | null | undefined,
	gl: OpenGlRenderer | null | undefined,
): RasterMode {
	return raster ?? (gl === "swangle" ? "gpu" : "cpu");
}

/**
 * How a software-GL browser rasterises, composites and draws canvases (D-041). With the CPU
 * raster, opaque captures composite in software: compositing on the GPU process makes SwiftShader
 * draw every frame on the CPU, and pages competing for it slow every capture down, while Chrome's
 * software compositor draws the same layers far cheaper (WebGL still runs on SwiftShader).
 * Transparent captures rasterise on the CPU and composite on SwiftShader: only that keeps the
 * faint alpha of antialiased edges of scaled and 3D-transformed layers that Remotion's renders
 * carry (D-031), which a transparent output shows. The GPU raster composites on SwiftShader
 * whatever the capture. The canvas flag only matters where Chrome composites on the GPU: under
 * software compositing both canvas modes draw identical pixels (measured), so it is left out there.
 *
 * The CPU raster composited on SwiftShader also turns zero-copy raster off. On macOS Chrome
 * rasterises tiles straight into buffers SwiftShader reads while compositing, and a capture could
 * show tiles holding another tile's content (another card of a scrolling rail, in 256 px blocks
 * under the layer's transform), differently on every run, even on a new page per frame. One-copy
 * raster, what Chrome uses on Linux anyway, rasterises into a staging buffer and copies it into
 * the tile, and draws the same pixels on every run (D-091).
 *
 * Wherever Chrome composites on SwiftShader, tile textures are reused only at their exact size.
 * By default a tile may take a texture up to twice its area left over from an earlier frame (a
 * larger raster scale of a moving layer), and SwiftShader then samples the tile through other
 * texture coordinates: text and photos of composited layers came out a level apart from a new
 * page's, depending on what the page drew before (D-091).
 */
export function softwareCompositingFlags(
	transparent: boolean,
	raster: RasterMode = "cpu",
	canvas: CanvasMode = "software",
): readonly string[] {
	if (raster === "cpu" && !transparent) return ["--disable-gpu-compositing"];
	const flags = raster === "cpu" ? ["--disable-gpu-rasterization", "--disable-zero-copy"] : [];
	flags.push("--disallow-non-exact-resource-reuse");
	if (canvas === "software") flags.push("--disable-accelerated-2d-canvas");
	return flags;
}

/** Options of `chromeArgs()` that come from the render rather than from `chromiumOptions`. */
export interface ChromeArgsContext {
	/** The page captures with a transparent background (PNG with alpha). Default false. */
	transparent?: boolean;
	/** The `raster` option; unset, `resolveRasterMode` decides. */
	raster?: RasterMode | null;
	/**
	 * The `canvas` option. Unset, canvases are drawn in software with software GL, and hardware GL
	 * keeps Chrome's own choice.
	 */
	canvas?: CanvasMode | null;
}

/**
 * Extra flags of the BeginFrame capture path (D-013): the compositor draws only when the renderer
 * sends `HeadlessExperimental.beginFrame`, and every stage runs before the frame is drawn.
 */
export const BEGIN_FRAME_FLAGS: readonly string[] = [
	"--enable-begin-frame-control",
	"--deterministic-mode",
	"--run-all-compositor-stages-before-draw",
	"--disable-new-content-rendering-timeout",
	"--disable-threaded-animation",
	"--disable-threaded-scrolling",
	"--disable-checker-imaging",
];

const GL_FLAGS: Record<OpenGlRenderer, readonly string[]> = {
	swangle: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	// Modern Chrome only offers SwiftShader through ANGLE.
	swiftshader: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	angle: ["--use-gl=angle", "--use-angle=default"],
	egl: ["--use-gl=egl"],
	vulkan: ["--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan"],
	"angle-egl": ["--use-gl=angle", "--use-angle=gl-egl"],
};

const RESERVED = /^(user-data-dir|remote-debugging-)/;

/** Builds Chrome's command line from `chromiumOptions`. */
export function chromeArgs(
	options: ChromiumOptions = {},
	context: ChromeArgsContext = {},
): string[] {
	const gl = options.gl ?? "swangle";
	const glFlags = GL_FLAGS[gl];
	if (!glFlags) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`chromiumOptions.gl must be one of ${Object.keys(GL_FLAGS).join(", ")}, got "${gl}"`,
		);
	}
	const args = new Map<string, string | true>();
	const put = (flag: string) => {
		const [name, ...rest] = flag.replace(/^--/, "").split("=");
		args.set(name as string, rest.length ? rest.join("=") : true);
	};
	for (const f of DETERMINISM_FLAGS) put(f);
	for (const f of glFlags) put(f);
	if (gl === "swangle" || gl === "swiftshader") {
		const raster = resolveRasterMode(context.raster, options.gl);
		const canvas = context.canvas ?? "software";
		for (const f of softwareCompositingFlags(context.transparent === true, raster, canvas)) put(f);
	} else {
		// Hardware GL keeps Chrome's own choice unless the render asked for one.
		if (context.raster === "cpu") put("--disable-gpu-rasterization");
		if (context.canvas === "software") put("--disable-accelerated-2d-canvas");
	}
	if (options.ignoreCertificateErrors) put("--ignore-certificate-errors");
	if (options.disableWebSecurity) put("--disable-web-security");
	if (options.enableMultiProcessOnLinux === false && process.platform === "linux") {
		put("--single-process");
	}
	if (process.platform === "linux") {
		put("--disable-dev-shm-usage");
		// Chrome refuses root without --no-sandbox, and Docker's default seccomp profile blocks the
		// user namespaces its sandbox needs: the official image sets MOTIO_CHROME_NO_SANDBOX=1, the
		// container being the isolation boundary (D-013).
		const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
		if (isRoot || process.env.MOTIO_CHROME_NO_SANDBOX === "1") put("--no-sandbox");
	}
	const enable = new Set<string>();
	const disable = new Set<string>();
	const existing = args.get("enable-features");
	if (typeof existing === "string") for (const f of existing.split(",")) enable.add(f);
	for (const [k, v] of Object.entries(options.features ?? {})) (v ? enable : disable).add(k);
	if (enable.size) args.set("enable-features", [...enable].join(","));
	if (disable.size) args.set("disable-features", [...disable].join(","));
	const blinkOn = Object.entries(options.blinkFeatures ?? {}).filter(([, v]) => v);
	const blinkOff = Object.entries(options.blinkFeatures ?? {}).filter(([, v]) => !v);
	if (blinkOn.length) args.set("enable-blink-features", blinkOn.map(([k]) => k).join(","));
	if (blinkOff.length) args.set("disable-blink-features", blinkOff.map(([k]) => k).join(","));
	for (const [k, v] of Object.entries(options.flags ?? {})) {
		const name = k.replace(/^--/, "");
		if (RESERVED.test(name)) {
			throw new MotioError(
				"E_INVALID_OPTION",
				`chromiumOptions.flags.${name} is reserved by the renderer`,
			);
		}
		if (v === false) args.delete(name);
		else args.set(name, v);
	}
	return [...args].map(([k, v]) => (v === true ? `--${k}` : `--${k}=${v}`));
}
