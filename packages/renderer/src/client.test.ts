import { describe, expect, it } from "vitest";
import recorded from "./__oracle__/client.json" with { type: "json" };
import * as client from "./client.js";

describe("@motiojs/renderer/client", () => {
	it("exports the constants of @remotion/renderer/client with the same values", () => {
		const internals = new Set(["BrowserSafeApis"]);
		expect(Object.keys(client).sort()).toEqual(recorded.exports.filter((n) => !internals.has(n)));
		for (const [name, value] of Object.entries(recorded.values)) {
			expect((client as Record<string, unknown>)[name], name).toStrictEqual(value);
		}
	});
});
