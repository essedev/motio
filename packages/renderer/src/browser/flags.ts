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
 * How a software-GL browser rasterises and composites (D-041). Opaque captures composite in
 * software: compositing on the GPU process makes SwiftShader draw every frame on the CPU, and
 * pages competing for it slow every capture down, while Chrome's software compositor draws the
 * same layers far cheaper (WebGL still runs on SwiftShader). Transparent captures rasterise on the
 * CPU and composite on SwiftShader: only that keeps the faint alpha of antialiased edges of scaled
 * and 3D-transformed layers that Remotion's renders carry (D-031), which a transparent output
 * shows. Both draw opaque content to identical pixels.
 */
export function softwareCompositingFlags(transparent: boolean): readonly string[] {
	return transparent ? ["--disable-gpu-rasterization"] : ["--disable-gpu-compositing"];
}

/** Options of `chromeArgs()` that come from the render rather than from `chromiumOptions`. */
export interface ChromeArgsContext {
	/** The page captures with a transparent background (PNG with alpha). Default false. */
	transparent?: boolean;
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
		for (const f of softwareCompositingFlags(context.transparent === true)) put(f);
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
