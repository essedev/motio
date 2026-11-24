import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
	checkedPages,
	declaredNames,
	guidePages,
	importsFor,
	REPO_DIR,
	referencedNames,
	syncPage,
} from "./sync.js";

describe("docs/guide and the package READMEs", () => {
	it("has pages", () => {
		expect(guidePages().length).toBeGreaterThan(5);
	});

	for (const path of checkedPages()) {
		it(`${relative(REPO_DIR, path)} shows its example files as they are and has no unchecked TypeScript`, () => {
			const text = readFileSync(path, "utf8");
			const synced = syncPage(text, dirname(path));
			expect(synced.problems).toEqual([]);
			expect(text, "Out of date: run node docs/guide/examples/sync.ts").toBe(synced.text);
		});
	}
});

describe("syncPage", () => {
	it("flags TypeScript blocks without an example comment", () => {
		expect(syncPage("```ts\nconst a = 1;\n```\n```bash\nls\n```").problems).toEqual([
			"line 1: a ts block without an example comment is not type-checked",
		]);
	});
});

describe("importsFor", () => {
	const file = [
		'import { Video as CanvasVideo } from "@motiojs/media";',
		"import {",
		"\tAbsoluteFill,",
		"\tSequence,",
		"\tSeries,",
		"\ttype CalculateMetadataFunction,",
		"\tuseDelayRender,",
		"\tdelayRender,",
		'} from "@motiojs/motio";',
		'import * as z from "zod";',
		'import React, { useState } from "react";',
		'import "./fonts";',
		"",
	].join("\n");

	it("keeps the names a snippet uses, renamed and type-only specifiers included", () => {
		const snippet =
			"const meta: CalculateMetadataFunction<{}> = 1;\n<CanvasVideo src={z.string()} />";
		expect(importsFor(file, snippet)).toEqual([
			'import { Video as CanvasVideo } from "@motiojs/media";',
			'import type { CalculateMetadataFunction } from "@motiojs/motio";',
			'import * as z from "zod";',
		]);
	});

	it("ignores property names, comments, strings and template text", () => {
		const snippet = [
			"// AbsoluteFill in a comment, /* Sequence */",
			'const label = "Series";',
			// A template literal in the snippet; split so the linter does not take it for one here.
			"const text = `React $" + "{useState.length}`;",
			"<Series.Sequence durationInFrames={10} />",
		].join("\n");
		expect(importsFor(file, snippet)).toEqual([
			'import { Series } from "@motiojs/motio";',
			'import { useState } from "react";',
		]);
	});

	it("leaves out imports the snippet shadows with its own declarations", () => {
		const snippet = "const { delayRender } = useDelayRender();\ndelayRender();";
		expect(importsFor(file, snippet)).toEqual(['import { useDelayRender } from "@motiojs/motio";']);
	});

	it("breaks a line longer than 100 characters as Biome does", () => {
		const snippet =
			"AbsoluteFill; Sequence; Series; useDelayRender; delayRender; let a: CalculateMetadataFunction;";
		expect(importsFor(file, snippet)).toEqual([
			[
				"import {",
				"\tAbsoluteFill,",
				"\tSequence,",
				"\tSeries,",
				"\ttype CalculateMetadataFunction,",
				"\tuseDelayRender,",
				"\tdelayRender,",
				'} from "@motiojs/motio";',
			].join("\n"),
		]);
	});

	it("keeps spread identifiers and drops words after a dot", () => {
		expect([...referencedNames("f(...props, a.b, a?.c)")].sort()).toEqual(["a", "f", "props"]);
		expect(
			[...declaredNames("const [a, b = 1] = x; let { c: d, ...e } = y; function g() {}")].sort(),
		).toEqual(["a", "b", "d", "e", "g"]);
	});
});
