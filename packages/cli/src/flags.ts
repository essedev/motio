import type { FlagSpecs } from "./args.js";

/** Flags every command takes. */
export const BASE_FLAGS = {
	json: { type: "boolean", description: "Print one JSON object on stdout (schema in schemas/)." },
	log: { type: "string", description: "Log level: trace, verbose, info, warn, error." },
	help: { type: "boolean", short: "h", description: "Show help for the command." },
} as const satisfies FlagSpecs;

/** Flags of commands that open a project in the browser. */
export const PROJECT_FLAGS = {
	...BASE_FLAGS,
	props: { type: "string", description: "Input props: a JSON object or the path to a JSON file." },
	config: {
		type: "string",
		description:
			"Config file (default: motio.config.ts, else remotion.config.ts, in the project root).",
	},
	"env-file": { type: "string", description: "Dotenv file to read instead of .env." },
	"public-dir": { type: "string", description: "Public directory (default public/)." },
	"browser-executable": { type: "string", description: "Chrome to use instead of the pinned one." },
	timeout: { type: "string", description: "delayRender() timeout per frame, in milliseconds." },
	gl: {
		type: "string",
		description: "OpenGL backend: angle, egl, swiftshader, swangle, vulkan, angle-egl.",
	},
	port: { type: "string", description: "Port of the local bundle server." },
	"bundle-cache": { type: "boolean", description: "Accepted for compatibility; no effect." },
	"ignore-certificate-errors": { type: "boolean", description: "Accept invalid TLS certificates." },
	"disable-web-security": { type: "boolean", description: "Disable CORS and other web security." },
	"user-agent": { type: "string", description: "User agent of the pages." },
	"dark-mode": { type: "boolean", description: "Emulate prefers-color-scheme: dark." },
	"capture-method": {
		type: "string",
		description:
			"Motio: frame capture, auto or screenshot (Page.captureScreenshot), or begin-frame (Linux, deprecated).",
	},
	"pages-per-browser": {
		type: "string",
		description:
			"Motio: pages sharing one browser process (default: the pages spread over two browsers).",
	},
	width: { type: "string", description: "Override the composition width." },
	height: { type: "string", description: "Override the composition height." },
	fps: { type: "string", description: "Override the composition frame rate." },
	duration: { type: "string", description: "Override the composition duration, in frames." },
} as const satisfies FlagSpecs;

/** Flags that control capture. */
export const CAPTURE_FLAGS = {
	scale: { type: "string", description: "Scale factor of the output, above 0 and at most 16." },
	"jpeg-quality": { type: "string", description: "JPEG quality from 0 to 100." },
	concurrency: {
		type: "string",
		description: "Pages rendering in parallel: a number or a percentage.",
	},
} as const satisfies FlagSpecs;
