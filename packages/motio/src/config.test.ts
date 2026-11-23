import { describe, expect, it } from "vitest";
import fixture from "../../core/src/__oracle__/exports.json" with { type: "json" };
import { CONFIG_MOVED_MESSAGE, Config } from "./config.js";

type Recorded = {
	ownKeys: string[];
	typeofKeys: Record<string, string>;
	typeofNested: Record<string, Record<string, string>>;
	sameNamespace: boolean;
	sameFunction: boolean;
	calls: Record<string, { status: number; stderr: string }>;
};
const recorded = (fixture.cases as Array<{ name: string; value: unknown }>).find(
	(c) => c.name === "Config",
)?.value as Recorded;

const config = Config as unknown as Record<string, Record<string, unknown>>;

describe("the deprecated Config of remotion", () => {
	it("has the shape of the published export", () => {
		expect(Reflect.ownKeys(Config).map(String)).toEqual(recorded.ownKeys);
		for (const [key, type] of Object.entries(recorded.typeofKeys)) {
			expect(typeof config[key], key).toBe(type);
		}
		for (const [namespace, keys] of Object.entries(recorded.typeofNested)) {
			for (const [key, type] of Object.entries(keys)) {
				expect(typeof config[namespace]?.[key], `${namespace}.${key}`).toBe(type);
			}
		}
		const [rendering, setCodec] = [Config.Rendering, Config.setCodec];
		expect(rendering === Config.Rendering).toBe(recorded.sameNamespace);
		expect(setCodec === Config.setCodec).toBe(recorded.sameFunction);
	});

	it("fails every setter with the message Remotion prints", () => {
		const message = recorded.calls["Config.setCodec('h264')"]?.stderr.trimEnd();
		expect(CONFIG_MOVED_MESSAGE).toBe(message);
		expect(() => Config.setCodec("h264")).toThrow(CONFIG_MOVED_MESSAGE);
		expect(() => Config.Rendering.setImageFormat("png")).toThrow(CONFIG_MOVED_MESSAGE);
	});
});
