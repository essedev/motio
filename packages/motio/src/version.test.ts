import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as motio from "./index.js";
import * as remotionVersion from "./remotion/version.js";
import * as remotionAlias from "./remotion.js";

const pkg = (dir: string) =>
	JSON.parse(readFileSync(resolve(import.meta.dirname, dir, "package.json"), "utf8")) as {
		version: string;
	};

describe("versions", () => {
	it("motio reports its own version, equal to the package versions", () => {
		expect(motio.VERSION).toBe(pkg("..").version);
		expect(motio.VERSION).toBe(pkg("../../core").version);
	});
	it("the remotion alias reports the Remotion API version Motio implements", () => {
		expect(remotionAlias.VERSION).toBe("4.0.545");
		expect(remotionVersion.VERSION).toBe("4.0.545");
		expect(motio.REMOTION_API_VERSION).toBe("4.0.545");
		expect(remotionAlias.interpolate).toBe(motio.interpolate);
	});
});
