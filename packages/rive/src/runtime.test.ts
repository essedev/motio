// The WebAssembly URL follows the runtime version this package pins, the one @remotion/rive pins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/rive.json" with { type: "json" };
import { RIVE_RUNTIME_VERSION, RIVE_WASM_URL } from "./runtime.js";

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
	dependencies: Record<string, string>;
};

describe("Rive runtime", () => {
	it("pins the runtime version in package.json and in the WebAssembly URL", () => {
		expect(pkg.dependencies["@rive-app/canvas-advanced"]).toBe(RIVE_RUNTIME_VERSION);
		expect(RIVE_WASM_URL).toContain(`@${RIVE_RUNTIME_VERSION}/`);
	});

	it("loads the WebAssembly module from the URL the published package requests", () => {
		expect(oracle.externalRequests).toEqual([RIVE_WASM_URL]);
	});
});
