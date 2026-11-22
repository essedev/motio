import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zColor, zMatrix, zTextarea } from "./index.js";

type Entry = { input: unknown; success: boolean; data?: unknown };
const golden = JSON.parse(
	readFileSync(
		resolve(import.meta.dirname, "../../../fixtures/zod-types/__golden__/remotion/zod-types.json"),
		"utf8",
	),
) as Record<"zColor" | "zMatrix" | "zTextarea", Entry[]>;

const revive = (v: unknown) => (v === "__undefined__" ? undefined : v);

describe.each([
	["zColor", zColor()],
	["zMatrix", zMatrix()],
	["zTextarea", zTextarea()],
] as const)("%s matches @remotion/zod-types 4.0.545", (name, schema) => {
	for (const e of golden[name]) {
		it(`${JSON.stringify(e.input)} -> ${e.success}`, () => {
			const r = schema.safeParse(revive(e.input));
			expect(r.success).toBe(e.success);
			if (e.success) expect(r.data).toEqual(revive(e.data));
		});
	}
});
