/** Pinned `chrome-headless-shell` build from Chrome for Testing. */
export const CHROME_VERSION = "158.0.8127.36";

/**
 * SHA-256 of each Chrome for Testing archive of the pinned build, computed when the pin was set
 * (Chrome for Testing publishes no digests). Keyed by Chrome for Testing platform name. Windows
 * is not a supported render platform.
 */
export const CHROME_ARCHIVE_SHA256: Readonly<Record<ChromePlatform, string>> = {
	"mac-arm64": "c24d40a3786322ff3a5e3ac6eed162226cbaf07ebe468715407827226b0f8897",
	"mac-x64": "e0c5d07d8f5bcc5bdd5ef370e7daf3770856b585fcc9eecf441c7e3bb2e3d1cf",
	linux64: "2d3a23017323c54fd457a678e4351f895c4076d8050e39d5aa6247f93448b73a",
	"linux-arm64": "176ee5c55486c22de43128871189061365ea28e881fc96016fd18e7cb59437c8",
};

/** Chrome for Testing platform names supported for rendering. */
export type ChromePlatform = "mac-arm64" | "mac-x64" | "linux64" | "linux-arm64";
