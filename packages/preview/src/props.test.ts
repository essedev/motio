import { describe, expect, it } from "vitest";
import { formatProps, parseProps } from "./props.js";

const schema = {
	safeParse(value: unknown) {
		const v = value as { title?: unknown; count?: unknown };
		const issues = [];
		if (typeof v.title !== "string") issues.push({ path: ["title"], message: "Expected string" });
		if (v.count !== undefined && typeof v.count !== "number") {
			issues.push({ path: ["nested", 0, "count"], message: "Expected number" });
		}
		return issues.length ? { success: false, error: { issues } } : { success: true };
	},
};

describe("parseProps", () => {
	it("parses an object and reports schema issues without failing", () => {
		expect(parseProps('{"title":"a"}', schema)).toEqual({
			ok: true,
			props: { title: "a" },
			issues: [],
		});
		expect(parseProps('{"title":1,"count":"x"}', schema)).toEqual({
			ok: true,
			props: { title: 1, count: "x" },
			issues: [
				{ path: "title", message: "Expected string" },
				{ path: "nested.0.count", message: "Expected number" },
			],
		});
	});

	it("treats an empty editor as no props", () => {
		expect(parseProps("  ", null)).toEqual({ ok: true, props: {}, issues: [] });
	});

	it("fails on invalid JSON and on values that are not objects", () => {
		const syntax = parseProps("{nope", null);
		expect(syntax.ok).toBe(false);
		expect(syntax.issues[0]?.message).toMatch(/JSON/);
		for (const text of ["[]", "1", "null", '"a"']) {
			expect(parseProps(text, null)).toEqual({
				ok: false,
				issues: [{ path: "", message: "The props must be a JSON object." }],
			});
		}
	});

	it("reports a schema that throws or fails without issues", () => {
		const throwing = {
			safeParse() {
				throw new Error("bad schema");
			},
		};
		expect(parseProps("{}", throwing).issues).toEqual([
			{ path: "", message: "The schema threw: bad schema" },
		]);
		expect(parseProps("{}", { safeParse: () => ({ success: false }) }).issues).toEqual([
			{ path: "", message: "The props do not match the schema." },
		]);
	});

	it("formats props with two-space indentation", () => {
		expect(formatProps({ a: 1 })).toBe('{\n  "a": 1\n}');
	});
});
