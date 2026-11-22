import { describe, expect, it, vi } from "vitest";
import { CalculateMetadataError, resolveComposition, toCompositionInfo } from "./resolve.js";
import type { RegisteredComposition } from "./types.js";

const base: RegisteredComposition = {
	id: "metadata",
	width: 640,
	height: 360,
	fps: 30,
	durationInFrames: 10,
	defaultProps: { title: "Metadata", nested: { a: 1, b: 2 } },
	calculateMetadata: null,
	schema: null,
	component: () => null,
	isStill: false,
	folder: null,
};

const opts = () => ({ signal: new AbortController().signal, isRendering: true });

describe("resolveComposition", () => {
	it("merges input props shallowly over the defaults", async () => {
		const config = await resolveComposition(base, { nested: { a: 9 } }, opts());
		expect(config.props).toEqual({ title: "Metadata", nested: { a: 9 } });
		expect(config.defaultProps).toBe(base.defaultProps);
	});

	it("applies calculateMetadata like the fixture (metadata.json)", async () => {
		const calculateMetadata = vi.fn(async ({ props }: { props: Record<string, unknown> }) => ({
			durationInFrames: 45,
			width: 480,
			height: 270,
			props: { ...props, title: `${String(props.title)} resolved` },
		}));
		const entry = { ...base, defaultProps: { title: "Metadata" }, calculateMetadata };
		const config = await resolveComposition(entry, {}, opts());
		expect(config).toMatchObject({
			width: 480,
			height: 270,
			fps: 30,
			durationInFrames: 45,
			defaultProps: { title: "Metadata" },
			props: { title: "Metadata resolved" },
		});
		expect(calculateMetadata.mock.calls[0]?.[0]).toMatchObject({
			compositionId: "metadata",
			isRendering: true,
			defaultProps: { title: "Metadata" },
			props: { title: "Metadata" },
		});
	});

	it("passes the default fields through and validates them", async () => {
		const entry: RegisteredComposition = {
			...base,
			calculateMetadata: () => ({
				defaultCodec: "h264",
				defaultOutName: "out",
				defaultVideoImageFormat: "png",
				defaultPixelFormat: "yuv420p",
				defaultProResProfile: "hq",
				defaultSampleRate: 44100,
			}),
		};
		const config = await resolveComposition(entry, {}, opts());
		expect(config).toMatchObject({
			defaultCodec: "h264",
			defaultOutName: "out",
			defaultVideoImageFormat: "png",
			defaultPixelFormat: "yuv420p",
			defaultProResProfile: "hq",
			defaultSampleRate: 44100,
		});
	});

	it("wraps errors and invalid results in CalculateMetadataError", async () => {
		const throwing = {
			...base,
			calculateMetadata: () => {
				throw new Error("API down");
			},
		};
		await expect(resolveComposition(throwing, {}, opts())).rejects.toThrow(
			/calculateMetadata\(\) of composition "metadata" failed: API down/,
		);
		const invalid = { ...base, calculateMetadata: () => ({ durationInFrames: 0 }) };
		await expect(resolveComposition(invalid, {}, opts())).rejects.toBeInstanceOf(
			CalculateMetadataError,
		);
	});

	it("warns, and keeps the props, when they do not match the schema", async () => {
		const warn = vi.fn();
		const schema = {
			safeParse: () => ({
				success: false,
				error: { issues: [{ path: ["title"], message: "Expected number" }] },
			}),
		};
		const config = await resolveComposition({ ...base, schema }, {}, { ...opts(), warn });
		expect(config.props.title).toBe("Metadata");
		expect(warn.mock.calls[0]?.[0]).toMatch(/title: Expected number/);
	});

	it("needs dimensions from somewhere", async () => {
		const entry = { ...base, width: undefined, calculateMetadata: () => ({}) };
		await expect(resolveComposition(entry, {}, opts())).rejects.toThrow(
			/"width".*positive integer/,
		);
	});
});

describe("toCompositionInfo", () => {
	it("reports the registered values and 0 for those left to calculateMetadata", () => {
		const info = toCompositionInfo({
			...base,
			width: undefined,
			calculateMetadata: () => ({ width: 10 }),
		});
		expect(info).toMatchObject({
			id: "metadata",
			width: 0,
			height: 360,
			hasCalculateMetadata: true,
		});
	});
});
