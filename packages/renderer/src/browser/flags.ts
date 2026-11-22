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
export function chromeArgs(options: ChromiumOptions = {}): string[] {
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
	if (options.ignoreCertificateErrors) put("--ignore-certificate-errors");
	if (options.disableWebSecurity) put("--disable-web-security");
	if (options.enableMultiProcessOnLinux === false && process.platform === "linux") {
		put("--single-process");
	}
	if (process.platform === "linux") {
		put("--disable-dev-shm-usage");
		if (typeof process.getuid === "function" && process.getuid() === 0) put("--no-sandbox");
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
