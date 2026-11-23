import { beforeEach, describe, expect, it } from "vitest";
import { enableTailwind as enableTailwindV4 } from "../tailwind-v4-entry.js";
import { CONFIG_SETTERS, Config, getSetterSupport } from "./config.js";
import { getConfigValues, getConfigWarnings, resetConfig, snapshotConfig } from "./store.js";

beforeEach(() => resetConfig());

describe("Config", () => {
	it("records supported values in the store", () => {
		Config.setEntryPoint("./src/entry.tsx");
		Config.setVideoImageFormat("png");
		Config.setConcurrency("50%");
		Config.setFrameRange([10, null]);
		Config.setCodec("h264");
		Config.setCodec("h265");
		expect(getConfigValues()).toEqual({
			entryPoint: "./src/entry.tsx",
			videoImageFormat: "png",
			concurrency: "50%",
			frameRange: [10, null],
			codec: "h265",
		});
		expect(getConfigWarnings()).toEqual([]);
	});

	it("throws E_INVALID_CONFIG on an invalid value for a supported setter", () => {
		expect(() => Config.setJpegQuality(101)).toThrow(
			expect.objectContaining({
				code: "E_INVALID_CONFIG",
				context: expect.objectContaining({ setter: "setJpegQuality" }),
			}),
		);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately wrong input
		expect(() => Config.setCodec("mpeg2" as any)).toThrow(/h264, h265/);
		expect(() => Config.setScale(0)).toThrow();
		expect(() => Config.setConcurrency("abc%" as `${number}%`)).toThrow();
	});

	it("records unsupported setters with a warning and never throws", () => {
		expect(() => {
			Config.setVideoBitrate("1M");
			Config.setKeyboardShortcutsEnabled(false);
			Config.setLambdaInsights(true);
			Config.setRspack(true);
			Config.setKeyboardShortcutsEnabled(true);
			// biome-ignore lint/suspicious/noExplicitAny: deliberately wrong input
			Config.setGopSize("not a number" as any);
		}).not.toThrow();
		expect(getConfigValues()).toEqual({ videoBitrate: "1M" });
		expect(getConfigWarnings().map((w) => [w.setter, w.reason])).toEqual([
			["setVideoBitrate", "planned"],
			["setKeyboardShortcutsEnabled", "studio"],
			["setLambdaInsights", "cloud"],
			["setRspack", "no-equivalent"],
			["setGopSize", "planned"],
		]);
	});

	it("applies the ProRes, GIF and image sequence setters without warnings", () => {
		Config.setProResProfile("4444");
		Config.setProResBitsPerMacroblock(2000);
		Config.setNumberOfGifLoops(null);
		Config.setNumberOfGifLoops(2);
		Config.setImageSequence(true);
		Config.setImageSequencePattern("frame_[frame].[ext]");
		expect(getConfigValues()).toEqual({
			proResProfile: "4444",
			proResBitsPerMacroblock: 2000,
			numberOfGifLoops: 2,
			imageSequence: true,
			imageSequencePattern: "frame_[frame].[ext]",
		});
		expect(getConfigWarnings()).toEqual([]);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately wrong input
		expect(() => Config.setProResProfile("best" as any)).toThrow(/4444-xq, 4444, hq/);
		expect(() => Config.setNumberOfGifLoops(-1)).toThrow();
	});

	it("warns that overrideWebpackConfig has no equivalent and points to Vite plugins", () => {
		const override = (c: Record<string, unknown>) => ({ ...c, devtool: false });
		Config.overrideWebpackConfig(override);
		expect(getConfigValues().webpackOverrides).toEqual([override]);
		const [warning] = getConfigWarnings();
		expect(warning?.reason).toBe("no-equivalent");
		expect(warning?.message).toMatch(/D-003/);
		expect(warning?.message).toMatch(/Vite plugin/);
	});

	it("recognises enableTailwind passed directly, without a warning", () => {
		Config.overrideWebpackConfig(enableTailwindV4);
		expect(getConfigValues()).toEqual({ tailwind: "v4" });
		expect(getConfigWarnings()).toEqual([]);
	});

	it("maps the renamed setQuality to the JPEG quality", () => {
		Config.setQuality(70);
		expect(getConfigValues().jpegQuality).toBe(70);
		expect(getConfigWarnings()[0]?.reason).toBe("deprecated");
	});

	it("exposes the pre-3.3.39 nested groups", () => {
		Config.Bundling.setCachingEnabled(false);
		Config.Rendering.setScale(2);
		expect(getConfigValues()).toMatchObject({ cachingEnabled: false, scale: 2 });
	});

	it("keeps snapshots independent of later resets", () => {
		Config.setMuted(true);
		const snapshot = snapshotConfig();
		resetConfig();
		expect(snapshot.values).toEqual({ muted: true });
		expect(getConfigValues()).toEqual({});
	});

	it("knows how every setter is handled", () => {
		expect(CONFIG_SETTERS.length).toBeGreaterThan(90);
		for (const setter of CONFIG_SETTERS) expect(getSetterSupport(setter), setter).toBeDefined();
		expect(getSetterSupport("setCodec")).toBe("supported");
		expect(getSetterSupport("overrideWebpackConfig")).toBe("no-equivalent");
	});
});
