import { describe, expect, it } from "vitest";
import {
	describeUnavailable,
	isRemotionSpecifier,
	mapSpecifier,
	splitSpecifier,
} from "./mapping.js";

describe("mapSpecifier", () => {
	it("maps remotion and its subpaths to motio", () => {
		expect(mapSpecifier("remotion")).toMatchObject({ kind: "mapped", target: "motio/remotion" });
		expect(mapSpecifier("remotion/version")).toMatchObject({
			kind: "mapped",
			target: "motio/remotion/version",
		});
		expect(mapSpecifier("remotion/no-react")).toMatchObject({ target: "motio/remotion/no-react" });
	});

	it("carries subpaths of scoped packages over", () => {
		expect(mapSpecifier("@remotion/transitions/fade")).toMatchObject({
			kind: "mapped",
			target: "@motiojs/transitions/fade",
		});
		expect(mapSpecifier("@remotion/google-fonts/Roboto")).toMatchObject({
			target: "@motiojs/google-fonts/Roboto",
		});
	});

	it("maps @remotion/cli/config to the compat config but rejects the rest of the CLI", () => {
		expect(mapSpecifier("@remotion/cli/config")).toMatchObject({
			kind: "mapped",
			target: "@motiojs/compat/config",
		});
		expect(mapSpecifier("@remotion/cli")).toMatchObject({ kind: "unsupported" });
	});

	it("maps @remotion/rounded-text-box to the preset of @motiojs/text", () => {
		expect(mapSpecifier("@remotion/rounded-text-box")).toMatchObject({
			kind: "mapped",
			target: "@motiojs/text/rounded-text-box",
		});
	});

	it("maps Tailwind helpers to the compat replacements", () => {
		expect(mapSpecifier("@remotion/tailwind-v4")).toMatchObject({
			target: "@motiojs/compat/tailwind-v4",
		});
	});

	it("reports packages without a replacement and unknown packages", () => {
		expect(mapSpecifier("@remotion/lambda")).toMatchObject({ kind: "unsupported" });
		expect(mapSpecifier("@remotion/does-not-exist")).toMatchObject({
			kind: "unknown",
			packageName: "@remotion/does-not-exist",
		});
	});
});

describe("helpers", () => {
	it("splits specifiers", () => {
		expect(splitSpecifier("@remotion/a/b/c")).toEqual({
			packageName: "@remotion/a",
			subpath: "/b/c",
		});
		expect(splitSpecifier("remotion")).toEqual({ packageName: "remotion", subpath: "" });
	});

	it("recognises Remotion specifiers only", () => {
		expect(isRemotionSpecifier("remotion")).toBe(true);
		expect(isRemotionSpecifier("@remotion/player")).toBe(true);
		expect(isRemotionSpecifier("remotion-animated")).toBe(false);
	});

	it("names the symbols and the alternative in messages", () => {
		const resolution = mapSpecifier("@remotion/lambda");
		if (resolution.kind !== "unsupported") throw new Error("expected unsupported");
		const message = describeUnavailable("@remotion/lambda", resolution.mapping, [
			"renderMediaOnLambda",
		]);
		expect(message).toContain("renderMediaOnLambda");
		expect(message).toContain("@motiojs/distributed");
		expect(message).toContain("Tier 2");
	});

	it("points @remotion/skia, mapped to a package that does not exist yet, to its decision", () => {
		const resolution = mapSpecifier("@remotion/skia/enable");
		if (resolution.kind !== "mapped") throw new Error("expected mapped");
		expect(resolution.target).toBe("@motiojs/skia/enable");
		expect(describeUnavailable("@remotion/skia/enable", resolution.mapping)).toContain("D-063");
	});
});
